'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Player = { id: string; name: string; role: string; base_price: number; auction_order: number; status: string; sold_to: string | null; sold_price: number | null }
type AuctionSettings = { id: string; mode: string; status: string; current_player_id: string | null; timer_end: string | null }
type Bid = { id: string; amount: number; bidder_id: string; profiles: { team_name: string } }

const roleStyles: Record<string, string> = {
  batsman: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  bowler: 'bg-red-500/20 text-red-400 border border-red-500/30',
  'all-rounder': 'bg-violet-500/20 text-violet-400 border border-violet-500/30',
  'wicket-keeper': 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
}

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
        .from('bids').select('*, profiles(team_name)')
        .eq('player_id', settingsData.current_player_id)
        .order('amount', { ascending: false }).limit(1)
      setTopBid(bids?.[0] ?? null)
    } else {
      setCurrentPlayer(null); setTopBid(null)
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
        supabase.from('players').update({ status: 'sold', sold_to: topBid.bidder_id, sold_price: topBid.amount }).eq('id', currentPlayer.id),
        profile ? supabase.from('profiles').update({ budget: profile.budget - topBid.amount }).eq('id', topBid.bidder_id) : Promise.resolve(),
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
        timer_end: settings.mode === 'online' ? new Date(Date.now() + parseInt(timerMinutes) * 60000).toISOString() : null,
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

  return (
    <div className="min-h-screen bg-[#13151a] text-white">
      <header className="bg-[#1a1d24] border-b border-[#2d3139] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center font-bold text-sm">CA</div>
          <span className="font-bold text-lg tracking-tight">Auction Control</span>
          {settings?.status === 'active' && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              Live
            </span>
          )}
        </div>
        <button
          onClick={() => router.push('/admin')}
          className="text-xs text-[#8b8fa8] hover:text-white px-3 py-1.5 rounded-lg hover:bg-[#252830] transition-colors"
        >
          Back
        </button>
      </header>

      <div className="max-w-3xl mx-auto p-6 space-y-4">

        {/* Settings */}
        <div className="bg-[#1a1d24] border border-[#2d3139] rounded-2xl p-6">
          <h2 className="font-bold mb-4">Settings</h2>
          <div className="flex items-center gap-6 flex-wrap">
            <div>
              <p className="text-xs text-[#8b8fa8] uppercase tracking-wider mb-2">Auction Mode</p>
              <div className="flex gap-2">
                {['live', 'online'].map(m => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`px-4 py-2 rounded-xl font-medium capitalize text-sm transition-colors ${
                      settings?.mode === m
                        ? 'bg-violet-600 text-white'
                        : 'bg-[#252830] text-[#8b8fa8] hover:text-white border border-[#2d3139]'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            {settings?.mode === 'online' && (
              <div>
                <p className="text-xs text-[#8b8fa8] uppercase tracking-wider mb-2">Timer per player</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={timerMinutes}
                    onChange={e => setTimerMinutes(e.target.value)}
                    min="1" max="60"
                    className="w-16 bg-[#252830] border border-[#2d3139] rounded-xl px-2 py-1.5 text-center text-white focus:outline-none focus:border-violet-500 transition-colors"
                  />
                  <span className="text-sm text-[#8b8fa8]">minutes</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Auction controls */}
        <div className="bg-[#1a1d24] border border-[#2d3139] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold">Auction Status</h2>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${
              settings?.status === 'active' ? 'bg-emerald-400/10 text-emerald-400' :
              settings?.status === 'complete' ? 'bg-violet-400/10 text-violet-400' :
              'bg-[#252830] text-[#8b8fa8]'
            }`}>{settings?.status}</span>
          </div>

          {currentPlayer && (
            <div className="bg-[#252830] rounded-xl p-4 mb-4">
              <p className="text-xs text-[#8b8fa8] mb-1">Current player</p>
              <p className="text-xl font-bold">{currentPlayer.name}</p>
              <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${roleStyles[currentPlayer.role] ?? 'bg-gray-500/20 text-gray-400'}`}>
                {currentPlayer.role}
              </span>
              {topBid ? (
                <div className="mt-3 bg-violet-600/10 border border-violet-500/30 rounded-lg px-3 py-2">
                  <p className="text-sm text-violet-400">Top bid: <strong>£{topBid.amount.toLocaleString()}</strong> by {(topBid.profiles as any)?.team_name}</p>
                </div>
              ) : (
                <p className="text-sm text-[#8b8fa8] mt-2">No bids yet</p>
              )}
            </div>
          )}

          <div className="flex gap-3 flex-wrap">
            {settings?.status === 'waiting' && (
              <button
                onClick={startAuction}
                disabled={players.filter(p => p.status === 'pending').length === 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-medium transition-colors disabled:opacity-50"
              >
                Start Auction
              </button>
            )}
            {settings?.status === 'active' && (
              <>
                <button
                  onClick={() => closeBidding('sold')}
                  disabled={!topBid}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-medium transition-colors disabled:opacity-40"
                >
                  Sold to Highest Bidder
                </button>
                <button
                  onClick={() => closeBidding('unsold')}
                  className="bg-[#252830] hover:bg-[#2d3139] border border-[#2d3139] text-[#8b8fa8] hover:text-white px-5 py-2.5 rounded-xl font-medium transition-colors"
                >
                  Mark Unsold
                </button>
              </>
            )}
            {settings?.status === 'complete' && (
              <button
                onClick={() => router.push('/results')}
                className="bg-violet-600 hover:bg-violet-700 text-white px-5 py-2.5 rounded-xl font-medium transition-colors"
              >
                View Results
              </button>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#1a1d24] border border-[#2d3139] rounded-xl p-4 text-center">
            <p className="text-xs text-[#8b8fa8] mb-1">Pending</p>
            <p className="text-2xl font-bold">{pending.length}</p>
          </div>
          <div className="bg-[#1a1d24] border border-[#2d3139] rounded-xl p-4 text-center">
            <p className="text-xs text-[#8b8fa8] mb-1">Sold</p>
            <p className="text-2xl font-bold text-emerald-400">{sold.length}</p>
          </div>
          <div className="bg-[#1a1d24] border border-[#2d3139] rounded-xl p-4 text-center">
            <p className="text-xs text-[#8b8fa8] mb-1">Unsold</p>
            <p className="text-2xl font-bold text-[#8b8fa8]">{unsold.length}</p>
          </div>
        </div>

        {/* Queue */}
        <div className="bg-[#1a1d24] border border-[#2d3139] rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-[#8b8fa8] uppercase tracking-widest mb-4">Queue ({pending.length} remaining)</h2>
          {pending.length === 0 ? (
            <p className="text-[#8b8fa8] text-sm">All players have been auctioned</p>
          ) : (
            <div className="space-y-2">
              {pending.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 bg-[#252830] rounded-xl px-4 py-2.5">
                  <span className="text-[#8b8fa8] text-xs w-5 tabular-nums">{i + 1}</span>
                  <span className="font-medium text-sm flex-1">{p.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${roleStyles[p.role] ?? 'bg-gray-500/20 text-gray-400'}`}>{p.role}</span>
                  <span className="text-xs text-[#8b8fa8]">£{p.base_price.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Danger zone */}
        <div className="bg-[#1a1d24] border border-red-500/20 rounded-2xl p-6">
          <h2 className="font-bold mb-1 text-red-400">Danger Zone</h2>
          <p className="text-sm text-[#8b8fa8] mb-4">Reset the auction to start over. This clears all bids and resets all budgets.</p>
          <button
            onClick={resetAuction}
            className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-4 py-2 rounded-xl font-medium text-sm transition-colors"
          >
            Reset Auction
          </button>
        </div>
      </div>
    </div>
  )
}
