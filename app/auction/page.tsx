'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Profile = { id: string; email: string; team_name: string; budget: number; is_admin: boolean }
type Player = { id: string; name: string; role: string; base_price: number; status: string; sold_to: string | null; sold_price: number | null }
type Bid = { id: string; player_id: string; bidder_id: string; amount: number; created_at: string; profiles: { team_name: string } }
type AuctionSettings = { id: string; mode: string; status: string; current_player_id: string | null; timer_end: string | null }

const roleStyles: Record<string, string> = {
  batsman: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  bowler: 'bg-red-500/20 text-red-400 border border-red-500/30',
  'all-rounder': 'bg-violet-500/20 text-violet-400 border border-violet-500/30',
  'wicket-keeper': 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
}

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

  return (
    <div className="min-h-screen bg-[#13151a] text-white">

      {/* Header */}
      <header className="bg-[#1a1d24] border-b border-[#2d3139] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center font-bold text-sm">CA</div>
          <span className="font-bold text-lg tracking-tight">Cricket Auction</span>
          {settings?.status === 'active' && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              Live
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {me?.is_admin && (
            <button
              onClick={() => router.push('/admin')}
              className="text-xs bg-violet-600 hover:bg-violet-700 px-3 py-1.5 rounded-lg font-medium transition-colors"
            >
              Admin
            </button>
          )}
          <button
            onClick={() => router.push('/squad')}
            className="text-xs text-[#8b8fa8] hover:text-white px-3 py-1.5 rounded-lg hover:bg-[#252830] transition-colors"
          >
            My Squad
          </button>
          <div className="h-4 w-px bg-[#2d3139]" />
          <div className="text-right">
            <p className="text-sm font-semibold">{me?.team_name}</p>
            <p className="text-xs text-emerald-400 font-medium">£{me?.budget.toLocaleString()}</p>
          </div>
          <button
            onClick={signOut}
            className="text-xs text-[#8b8fa8] hover:text-white px-3 py-1.5 rounded-lg hover:bg-[#252830] transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Main auction area */}
        <div className="lg:col-span-2 space-y-4">

          {settings?.status === 'waiting' && (
            <div className="bg-[#1a1d24] border border-[#2d3139] rounded-2xl p-12 text-center">
              <div className="w-16 h-16 bg-[#252830] rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-[#8b8fa8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-xl font-bold text-white mb-2">Waiting to begin</p>
              <p className="text-[#8b8fa8] text-sm">The auctioneer will start shortly</p>
            </div>
          )}

          {settings?.status === 'complete' && (
            <div className="bg-[#1a1d24] border border-[#2d3139] rounded-2xl p-12 text-center">
              <div className="w-16 h-16 bg-violet-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-xl font-bold mb-4">Auction Complete!</p>
              <button
                onClick={() => router.push('/results')}
                className="bg-violet-600 hover:bg-violet-700 text-white px-6 py-2.5 rounded-xl font-medium transition-colors"
              >
                View Results
              </button>
            </div>
          )}

          {(settings?.status === 'active' || settings?.status === 'paused') && currentPlayer && (
            <div className="bg-[#1a1d24] border border-[#2d3139] rounded-2xl p-6 space-y-5">

              {/* Player header */}
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-[#8b8fa8] uppercase tracking-widest mb-2">Now up for auction</p>
                  <h2 className="text-4xl font-bold tracking-tight">{currentPlayer.name}</h2>
                  <span className={`inline-block mt-3 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${roleStyles[currentPlayer.role] ?? 'bg-gray-500/20 text-gray-400'}`}>
                    {currentPlayer.role}
                  </span>
                </div>
                {settings.mode === 'online' && timeLeft !== null && (
                  <div className={`text-center bg-[#252830] rounded-2xl px-5 py-3 ${timeLeft < 30 ? 'ring-1 ring-red-500/50' : ''}`}>
                    <p className={`text-5xl font-bold tabular-nums ${timeLeft < 30 ? 'text-red-400' : 'text-white'}`}>{timeLeft}</p>
                    <p className="text-xs text-[#8b8fa8] mt-1">seconds</p>
                  </div>
                )}
              </div>

              {/* Base price + top bid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#252830] rounded-xl p-4">
                  <p className="text-xs text-[#8b8fa8] mb-1">Base price</p>
                  <p className="text-xl font-bold">£{currentPlayer.base_price.toLocaleString()}</p>
                </div>
                <div className={`rounded-xl p-4 ${topBid ? 'bg-violet-600/15 border border-violet-500/30' : 'bg-[#252830]'}`}>
                  <p className="text-xs text-[#8b8fa8] mb-1">Top bid</p>
                  {topBid ? (
                    <>
                      <p className="text-xl font-bold text-violet-400">£{topBid.amount.toLocaleString()}</p>
                      <p className="text-xs text-[#8b8fa8] mt-0.5">{(topBid.profiles as any)?.team_name}</p>
                    </>
                  ) : (
                    <p className="text-xl font-bold text-[#8b8fa8]">No bids yet</p>
                  )}
                </div>
              </div>

              {/* Bidding controls */}
              {settings.status === 'active' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {[100, 500, 1000].map(inc => (
                      <button
                        key={inc}
                        type="button"
                        onClick={() => raiseBid(inc)}
                        className="bg-[#252830] hover:bg-[#2d3139] border border-[#2d3139] hover:border-violet-500/50 text-white py-2.5 rounded-xl text-sm font-medium transition-all"
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
                      className="flex-1 bg-[#252830] border border-[#2d3139] rounded-xl px-4 py-3 text-white placeholder-[#8b8fa8] focus:outline-none focus:border-violet-500 transition-colors"
                    />
                    <button
                      type="submit"
                      className="bg-violet-600 hover:bg-violet-700 text-white px-8 py-3 rounded-xl font-semibold transition-colors"
                    >
                      Place Bid
                    </button>
                  </form>
                  {error && <p className="text-red-400 text-sm">{error}</p>}
                </div>
              )}

              {settings.status === 'paused' && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-amber-400 text-sm font-medium text-center">
                  Bidding paused
                </div>
              )}

              {/* Admin controls */}
              {me?.is_admin && settings.status === 'active' && (
                <div className="flex gap-3 pt-4 border-t border-[#2d3139]">
                  <button
                    onClick={() => closeBidding('sold')}
                    disabled={!topBid}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Sold
                  </button>
                  <button
                    onClick={() => closeBidding('unsold')}
                    className="flex-1 bg-[#252830] hover:bg-[#2d3139] border border-[#2d3139] text-[#8b8fa8] hover:text-white py-2.5 rounded-xl font-medium transition-colors"
                  >
                    Unsold
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Bid history */}
          {bids.length > 0 && (
            <div className="bg-[#1a1d24] border border-[#2d3139] rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-[#8b8fa8] uppercase tracking-widest mb-4">Bid History</h3>
              <div className="space-y-2">
                {bids.map((bid, i) => (
                  <div
                    key={bid.id}
                    className={`flex justify-between items-center px-4 py-3 rounded-xl text-sm ${
                      i === 0
                        ? 'bg-violet-600/15 border border-violet-500/30 text-white'
                        : 'bg-[#252830] text-[#8b8fa8]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {i === 0 && <span className="w-1.5 h-1.5 bg-violet-400 rounded-full" />}
                      <span>{(bid.profiles as any)?.team_name}</span>
                    </div>
                    <span className={`font-semibold ${i === 0 ? 'text-violet-400' : ''}`}>
                      £{bid.amount.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">

          {/* Team budgets */}
          <div className="bg-[#1a1d24] border border-[#2d3139] rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-[#8b8fa8] uppercase tracking-widest mb-4">Team Budgets</h3>
            <div className="space-y-2">
              {profiles.map(p => (
                <div
                  key={p.id}
                  className={`flex justify-between items-center px-3 py-2.5 rounded-xl text-sm transition-colors ${
                    p.id === me?.id
                      ? 'bg-violet-600/15 border border-violet-500/30'
                      : 'bg-[#252830]'
                  }`}
                >
                  <div>
                    <p className="font-medium text-white">{p.team_name || p.email}</p>
                    {p.id === me?.id && <p className="text-xs text-violet-400">You</p>}
                  </div>
                  <span className={`font-semibold text-sm ${p.id === me?.id ? 'text-violet-400' : 'text-[#8b8fa8]'}`}>
                    £{p.budget.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Auction info */}
          <div className="bg-[#1a1d24] border border-[#2d3139] rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-[#8b8fa8] uppercase tracking-widest mb-4">Auction Info</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-[#8b8fa8]">Mode</span>
                <span className="font-medium capitalize text-white">{settings?.mode ?? '—'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#8b8fa8]">Status</span>
                <span className={`font-medium capitalize px-2 py-0.5 rounded-full text-xs ${
                  settings?.status === 'active'
                    ? 'bg-emerald-400/10 text-emerald-400'
                    : settings?.status === 'paused'
                    ? 'bg-amber-400/10 text-amber-400'
                    : 'bg-[#252830] text-[#8b8fa8]'
                }`}>
                  {settings?.status ?? '—'}
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
