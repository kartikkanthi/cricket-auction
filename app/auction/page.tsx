'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Profile = { id: string; email: string; team_name: string; budget: number; is_admin: boolean }
type Player = { id: string; name: string; role: string; base_price: number; status: string; sold_to: string | null; sold_price: number | null }
type Bid = { id: string; player_id: string; bidder_id: string; amount: number; created_at: string; profiles: { team_name: string } }
type AuctionSettings = { id: string; mode: string; status: string; current_player_id: string | null; timer_end: string | null }

export default function AuctionPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [me, setMe] = useState<Profile | null>(null)
  const [settings, setSettings] = useState<AuctionSettings | null>(null)
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null)
  const [bids, setBids] = useState<Bid[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [bidAmount, setBidAmount] = useState('')
  const [error, setError] = useState('')
  const [timeLeft, setTimeLeft] = useState<number | null>(null)

  const topBid = bids[0]
  const minBid = topBid ? topBid.amount + 1000 : (currentPlayer?.base_price ?? 0)

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    const [{ data: profile }, { data: settingsData }, { data: profilesData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('auction_settings').select('*').single(),
      supabase.from('profiles').select('*').order('budget', { ascending: false }),
    ])

    setMe(profile)
    setSettings(settingsData)
    setProfiles(profilesData ?? [])

    if (settingsData?.current_player_id) {
      const { data: player } = await supabase.from('players').select('*').eq('id', settingsData.current_player_id).single()
      setCurrentPlayer(player)

      const { data: bidsData } = await supabase
        .from('bids')
        .select('*, profiles(team_name)')
        .eq('player_id', settingsData.current_player_id)
        .order('amount', { ascending: false })
      setBids(bidsData ?? [])
    } else {
      setCurrentPlayer(null)
      setBids([])
    }
  }, [supabase, router])

  useEffect(() => {
    loadData()

    const channel = supabase.channel('auction-room')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auction_settings' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bids' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, loadData)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [loadData, supabase])

  useEffect(() => {
    if (!settings?.timer_end) { setTimeLeft(null); return }
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((new Date(settings.timer_end!).getTime() - Date.now()) / 1000))
      setTimeLeft(remaining)
    }, 1000)
    return () => clearInterval(interval)
  }, [settings?.timer_end])

  function raiseBid(increment: number) {
    const current = parseInt(bidAmount)
    const base = isNaN(current) ? minBid : current
    setBidAmount(String(base + increment))
  }

  async function placeBid(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const amount = parseInt(bidAmount)

    if (isNaN(amount) || amount < minBid) {
      setError(`Minimum bid is £${minBid.toLocaleString()}`)
      return
    }
    if (me && amount > me.budget) {
      setError(`You only have £${me.budget.toLocaleString()} remaining`)
      return
    }

    const { error: bidError } = await supabase.from('bids').insert({
      player_id: currentPlayer!.id,
      bidder_id: me!.id,
      amount,
    })

    if (bidError) setError(bidError.message)
    else setBidAmount('')
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
        timer_end: null,
      }).eq('id', settings.id)
      await supabase.from('players').update({ status: 'active' }).eq('id', pending[0].id)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const roleColors: Record<string, string> = {
    batsman: 'bg-blue-100 text-blue-800',
    bowler: 'bg-red-100 text-red-800',
    'all-rounder': 'bg-purple-100 text-purple-800',
    'wicket-keeper': 'bg-yellow-100 text-yellow-800',
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-green-700 text-white px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Cricket Auction</h1>
        <div className="flex items-center gap-4">
          {me?.is_admin && (
            <button onClick={() => router.push('/admin')} className="bg-white text-green-700 px-3 py-1 rounded font-medium text-sm hover:bg-green-50">
              Admin Panel
            </button>
          )}
          <button onClick={() => router.push('/squad')} className="text-sm opacity-75 hover:opacity-100">My Squad</button>
          <span className="text-sm opacity-90">{me?.team_name}</span>
          <span className="font-bold">£{me?.budget.toLocaleString()}</span>
          <button onClick={signOut} className="text-sm opacity-75 hover:opacity-100">Sign out</button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main auction area */}
        <div className="lg:col-span-2 space-y-6">

          {/* Auction status */}
          {settings?.status === 'waiting' && (
            <div className="bg-white rounded-xl shadow p-8 text-center">
              <p className="text-2xl font-bold text-gray-400">Auction hasn&apos;t started yet</p>
              <p className="text-gray-500 mt-2">The auctioneer will begin shortly</p>
            </div>
          )}

          {settings?.status === 'complete' && (
            <div className="bg-white rounded-xl shadow p-8 text-center">
              <p className="text-2xl font-bold text-green-600">Auction Complete!</p>
              <button onClick={() => router.push('/results')} className="mt-4 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700">
                View Results
              </button>
            </div>
          )}

          {(settings?.status === 'active' || settings?.status === 'paused') && currentPlayer && (
            <div className="bg-white rounded-xl shadow p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Now up for auction</p>
                  <h2 className="text-3xl font-bold">{currentPlayer.name}</h2>
                  <span className={`inline-block mt-2 px-3 py-1 rounded-full text-sm font-medium ${roleColors[currentPlayer.role] ?? 'bg-gray-100'}`}>
                    {currentPlayer.role}
                  </span>
                </div>
                {settings.mode === 'online' && timeLeft !== null && (
                  <div className={`text-center ${timeLeft < 30 ? 'text-red-600' : 'text-gray-700'}`}>
                    <p className="text-4xl font-bold">{timeLeft}s</p>
                    <p className="text-sm">remaining</p>
                  </div>
                )}
              </div>

              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <p className="text-sm text-gray-500">Base price</p>
                <p className="text-lg font-semibold">£{currentPlayer.base_price.toLocaleString()}</p>
              </div>

              {topBid && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-green-700">Current highest bid</p>
                  <p className="text-2xl font-bold text-green-700">£{topBid.amount.toLocaleString()}</p>
                  <p className="text-sm text-green-600">{(topBid.profiles as any)?.team_name}</p>
                </div>
              )}

              {settings.status === 'active' && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    {[100, 500, 1000].map(inc => (
                      <button
                        key={inc}
                        type="button"
                        onClick={() => raiseBid(inc)}
                        className="flex-1 border border-green-600 text-green-700 py-2 rounded-lg font-medium hover:bg-green-50"
                      >
                        +£{inc.toLocaleString()}
                      </button>
                    ))}
                  </div>
                  <form onSubmit={placeBid} className="flex gap-3">
                    <input
                      type="number"
                      value={bidAmount}
                      onChange={e => setBidAmount(e.target.value)}
                      placeholder={`Min £${minBid.toLocaleString()}`}
                      className="flex-1 border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <button type="submit" className="bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700">
                      Bid
                    </button>
                  </form>
                </div>
              )}
              {error && <p className="text-red-500 text-sm mt-2">{error}</p>}

              {me?.is_admin && settings.status === 'active' && (
                <div className="flex gap-3 mt-4 pt-4 border-t">
                  <button
                    onClick={() => closeBidding('sold')}
                    disabled={!topBid}
                    className="flex-1 bg-green-600 text-white py-2 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
                  >
                    Sold
                  </button>
                  <button
                    onClick={() => closeBidding('unsold')}
                    className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-medium hover:bg-gray-300"
                  >
                    Unsold
                  </button>
                </div>
              )}

            </div>
          )}

          {/* Bid history */}
          {bids.length > 0 && (
            <div className="bg-white rounded-xl shadow p-6">
              <h3 className="font-semibold mb-3">Bid History</h3>
              <div className="space-y-2">
                {bids.map((bid, i) => (
                  <div key={bid.id} className={`flex justify-between items-center py-2 px-3 rounded-lg ${i === 0 ? 'bg-green-50 font-semibold' : 'bg-gray-50'}`}>
                    <span className="text-sm">{(bid.profiles as any)?.team_name}</span>
                    <span>£{bid.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Teams sidebar */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="font-semibold mb-3">Team Budgets</h3>
            <div className="space-y-3">
              {profiles.map(p => (
                <div key={p.id} className={`flex justify-between items-center py-2 px-3 rounded-lg ${p.id === me?.id ? 'bg-green-50 ring-1 ring-green-300' : 'bg-gray-50'}`}>
                  <div>
                    <p className="font-medium text-sm">{p.team_name || p.email}</p>
                    {p.id === me?.id && <p className="text-xs text-green-600">You</p>}
                  </div>
                  <span className="font-semibold text-sm">£{p.budget.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="font-semibold mb-3">Auction Info</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Mode</span>
                <span className="font-medium capitalize">{settings?.mode ?? '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <span className={`font-medium capitalize ${settings?.status === 'active' ? 'text-green-600' : 'text-gray-600'}`}>
                  {settings?.status ?? '-'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
