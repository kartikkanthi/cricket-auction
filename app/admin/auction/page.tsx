'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Player = { id: string; name: string; role: string; base_price: number; auction_order: number; status: string; sold_to: string | null; sold_price: number | null }
type AuctionSettings = { id: string; mode: string; status: string; current_player_id: string | null; timer_end: string | null }
type Bid = { id: string; amount: number; bidder_id: string; profiles: { team_name: string } }

export default function AuctionControlPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [settings, setSettings] = useState<AuctionSettings | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null)
  const [topBid, setTopBid] = useState<Bid | null>(null)
  const [timerMinutes, setTimerMinutes] = useState('5')

  const load = useCallback(async () => {
    const [{ data: settingsData }, { data: playersData }] = await Promise.all([
      supabase.from('auction_settings').select('*').single(),
      supabase.from('players').select('*').order('auction_order'),
    ])
    setSettings(settingsData)
    setPlayers(playersData ?? [])

    if (settingsData?.current_player_id) {
      const { data: player } = await supabase.from('players').select('*').eq('id', settingsData.current_player_id).single()
      setCurrentPlayer(player)

      const { data: bids } = await supabase
        .from('bids')
        .select('*, profiles(team_name)')
        .eq('player_id', settingsData.current_player_id)
        .order('amount', { ascending: false })
        .limit(1)
      setTopBid(bids?.[0] ?? null)
    } else {
      setCurrentPlayer(null)
      setTopBid(null)
    }
  }, [supabase])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
      if (!profile?.is_admin) { router.push('/auction'); return }
      load()
    }
    init()

    const channel = supabase.channel('auction-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bids' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auction_settings' }, load)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase, router, load])

  async function setMode(mode: string) {
    await supabase.from('auction_settings').update({ mode }).eq('id', settings!.id)
    load()
  }

  async function startAuction() {
    const firstPlayer = players.find(p => p.status === 'pending')
    if (!firstPlayer) return
    await supabase.from('auction_settings').update({
      status: 'active',
      current_player_id: firstPlayer.id,
      timer_end: settings?.mode === 'online'
        ? new Date(Date.now() + parseInt(timerMinutes) * 60000).toISOString()
        : null,
    }).eq('id', settings!.id)
    await supabase.from('players').update({ status: 'active' }).eq('id', firstPlayer.id)
    load()
  }

  async function closeBidding(outcome: 'sold' | 'unsold') {
    if (!currentPlayer || !settings) return

    if (outcome === 'sold' && topBid) {
      const { data: profile } = await supabase.from('profiles').select('budget').eq('id', topBid.bidder_id).single()
      await Promise.all([
        supabase.from('players').update({
          status: 'sold',
          sold_to: topBid.bidder_id,
          sold_price: topBid.amount,
        }).eq('id', currentPlayer.id),
        profile
          ? supabase.from('profiles').update({ budget: profile.budget - topBid.amount }).eq('id', topBid.bidder_id)
          : Promise.resolve(),
      ])
    } else {
      await supabase.from('players').update({ status: 'unsold' }).eq('id', currentPlayer.id)
    }

    const { data: playersData } = await supabase.from('players').select('id, status, auction_order').order('auction_order')
    const pending = (playersData ?? []).filter((p: any) => p.status === 'pending')

    if (pending.length === 0) {
      await supabase.from('auction_settings').update({ status: 'complete', current_player_id: null, timer_end: null }).eq('id', settings.id)
    } else {
      await supabase.from('auction_settings').update({
        status: 'active',
        current_player_id: pending[0].id,
        timer_end: settings.mode === 'online'
          ? new Date(Date.now() + parseInt(timerMinutes) * 60000).toISOString()
          : null,
      }).eq('id', settings.id)
      await supabase.from('players').update({ status: 'active' }).eq('id', pending[0].id)
    }
    load()
  }

  async function resetAuction() {
    if (!confirm('Reset the entire auction? This will clear all bids and results.')) return
    await Promise.all([
      supabase.from('bids').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      supabase.from('players').update({ status: 'pending', sold_to: null, sold_price: null }).neq('id', '00000000-0000-0000-0000-000000000000'),
      supabase.from('profiles').update({ budget: 100000 }).neq('id', '00000000-0000-0000-0000-000000000000'),
      supabase.from('auction_settings').update({ status: 'waiting', current_player_id: null, timer_end: null }).eq('id', settings!.id),
    ])
    load()
  }

  const pending = players.filter(p => p.status === 'pending')
  const sold = players.filter(p => p.status === 'sold')
  const unsold = players.filter(p => p.status === 'unsold')

  const roleColors: Record<string, string> = {
    batsman: 'bg-blue-100 text-blue-800',
    bowler: 'bg-red-100 text-red-800',
    'all-rounder': 'bg-purple-100 text-purple-800',
    'wicket-keeper': 'bg-yellow-100 text-yellow-800',
  }

  return (
    <div className="min-h-screen">
      <header className="bg-green-700 text-white px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Auction Control</h1>
        <button onClick={() => router.push('/admin')} className="text-sm opacity-75 hover:opacity-100">Back</button>
      </header>

      <div className="max-w-3xl mx-auto p-6 space-y-6">
        {/* Mode & settings */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="font-bold mb-4">Settings</h2>
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <p className="text-sm text-gray-500 mb-2">Auction Mode</p>
              <div className="flex gap-2">
                {['live', 'online'].map(m => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`px-4 py-2 rounded-lg font-medium capitalize text-sm ${settings?.mode === m ? 'bg-green-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            {settings?.mode === 'online' && (
              <div>
                <p className="text-sm text-gray-500 mb-2">Timer per player</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={timerMinutes}
                    onChange={e => setTimerMinutes(e.target.value)}
                    min="1"
                    max="60"
                    className="w-16 border rounded-lg px-2 py-1 text-center"
                  />
                  <span className="text-sm text-gray-500">minutes</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Current player */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="font-bold mb-4">Auction Status: <span className={`capitalize ${settings?.status === 'active' ? 'text-green-600' : 'text-gray-500'}`}>{settings?.status}</span></h2>

          {currentPlayer && (
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <p className="text-sm text-gray-500">Current player</p>
              <p className="text-xl font-bold">{currentPlayer.name}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full ${roleColors[currentPlayer.role] ?? 'bg-gray-100'}`}>{currentPlayer.role}</span>
              {topBid && (
                <div className="mt-3 bg-green-50 rounded p-3">
                  <p className="text-sm text-green-700">Top bid: <strong>£{topBid.amount.toLocaleString()}</strong> by {(topBid.profiles as any)?.team_name}</p>
                </div>
              )}
              {!topBid && <p className="text-sm text-gray-400 mt-2">No bids yet</p>}
            </div>
          )}

          <div className="flex gap-3 flex-wrap">
            {settings?.status === 'waiting' && (
              <button onClick={startAuction} disabled={players.filter(p => p.status === 'pending').length === 0} className="bg-green-600 text-white px-5 py-2 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50">
                Start Auction
              </button>
            )}
            {settings?.status === 'active' && (
              <>
                <button onClick={() => closeBidding('sold')} disabled={!topBid} className="bg-green-600 text-white px-5 py-2 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50">
                  Sold to Highest Bidder
                </button>
                <button onClick={() => closeBidding('unsold')} className="bg-gray-200 text-gray-700 px-5 py-2 rounded-lg font-medium hover:bg-gray-300">
                  Mark Unsold
                </button>
              </>
            )}
            {settings?.status === 'complete' && (
              <button onClick={() => router.push('/results')} className="bg-blue-600 text-white px-5 py-2 rounded-lg font-medium hover:bg-blue-700">
                View Results
              </button>
            )}
          </div>
        </div>

        {/* Player queue */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="font-bold mb-3">Queue ({pending.length} remaining)</h2>
          {pending.length === 0 ? (
            <p className="text-gray-400 text-sm">All players have been auctioned</p>
          ) : (
            <div className="space-y-2">
              {pending.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-2">
                  <span className="text-gray-400 text-xs w-5">{i + 1}</span>
                  <span className="font-medium text-sm">{p.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${roleColors[p.role] ?? 'bg-gray-100'}`}>{p.role}</span>
                  <span className="ml-auto text-xs text-gray-400">£{p.base_price.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Reset */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="font-bold mb-2 text-red-600">Danger Zone</h2>
          <p className="text-sm text-gray-500 mb-3">Reset the auction to start over. This clears all bids and resets all budgets.</p>
          <button onClick={resetAuction} className="bg-red-100 text-red-600 px-4 py-2 rounded-lg font-medium hover:bg-red-200 text-sm">
            Reset Auction
          </button>
        </div>
      </div>
    </div>
  )
}
