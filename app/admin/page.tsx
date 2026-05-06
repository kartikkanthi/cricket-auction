'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Profile = { id: string; team_name: string; email: string; budget: number; is_admin: boolean }
type AuctionSettings = { mode: string; status: string; current_player_id: string | null }
type Player = { id: string; name: string; role: string; status: string; sold_price: number | null; auction_order: number }

export default function AdminPage() {
  const router = useRouter()
  const supabase = createClient()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [settings, setSettings] = useState<AuctionSettings | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!profile?.is_admin) { router.push('/auction'); return }

      const [{ data: profilesData }, { data: settingsData }, { data: playersData }] = await Promise.all([
        supabase.from('profiles').select('*').order('team_name'),
        supabase.from('auction_settings').select('*').single(),
        supabase.from('players').select('*').order('auction_order'),
      ])

      setProfiles(profilesData ?? [])
      setSettings(settingsData)
      setPlayers(playersData ?? [])
      setLoading(false)
    }
    load()
  }, [supabase, router])

  if (loading) return (
    <div className="min-h-screen bg-[#13151a] flex items-center justify-center">
      <p className="text-[#8b8fa8]">Loading…</p>
    </div>
  )

  const totalPlayers = players.length
  const soldPlayers = players.filter(p => p.status === 'sold').length

  return (
    <div className="min-h-screen bg-[#13151a] text-white">
      <header className="bg-[#1a1d24] border-b border-[#2d3139] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center font-bold text-sm">CA</div>
          <span className="font-bold text-lg tracking-tight">Admin Panel</span>
        </div>
        <button
          onClick={() => router.push('/auction')}
          className="text-xs text-[#8b8fa8] hover:text-white px-3 py-1.5 rounded-lg hover:bg-[#252830] transition-colors"
        >
          Back to Auction Room
        </button>
      </header>

      <div className="max-w-5xl mx-auto p-6 space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-[#1a1d24] border border-[#2d3139] rounded-2xl p-5">
            <p className="text-xs text-[#8b8fa8] uppercase tracking-wider mb-2">Teams</p>
            <p className="text-3xl font-bold">{profiles.length}</p>
          </div>
          <div className="bg-[#1a1d24] border border-[#2d3139] rounded-2xl p-5">
            <p className="text-xs text-[#8b8fa8] uppercase tracking-wider mb-2">Players</p>
            <p className="text-3xl font-bold">{totalPlayers}</p>
          </div>
          <div className="bg-[#1a1d24] border border-[#2d3139] rounded-2xl p-5">
            <p className="text-xs text-[#8b8fa8] uppercase tracking-wider mb-2">Sold</p>
            <p className="text-3xl font-bold">{soldPlayers} <span className="text-lg text-[#8b8fa8]">/ {totalPlayers}</span></p>
          </div>
        </div>

        {/* Nav cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => router.push('/admin/players')}
            className="bg-[#1a1d24] border border-[#2d3139] hover:border-violet-500/50 rounded-2xl p-6 text-left transition-all group"
          >
            <div className="w-10 h-10 bg-violet-600/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-violet-600/30 transition-colors">
              <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold mb-1">Manage Players</h2>
            <p className="text-[#8b8fa8] text-sm">Add players, set roles, and order the auction</p>
          </button>
          <button
            onClick={() => router.push('/admin/auction')}
            className="bg-[#1a1d24] border border-[#2d3139] hover:border-violet-500/50 rounded-2xl p-6 text-left transition-all group"
          >
            <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-emerald-500/30 transition-colors">
              <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold mb-1">Control Auction</h2>
            <p className="text-[#8b8fa8] text-sm">Start, pause, move to next player, close bidding</p>
          </button>
        </div>

        {/* Team list */}
        <div className="bg-[#1a1d24] border border-[#2d3139] rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-[#8b8fa8] uppercase tracking-widest mb-4">Teams</h2>
          <div className="space-y-2">
            {profiles.map(p => (
              <div key={p.id} className="flex items-center justify-between bg-[#252830] rounded-xl px-4 py-3">
                <div>
                  <p className="font-medium">{p.team_name || p.email}</p>
                  <p className="text-xs text-[#8b8fa8]">{p.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  {p.is_admin && <span className="text-xs bg-violet-500/20 text-violet-400 border border-violet-500/30 px-2 py-0.5 rounded-full">Admin</span>}
                  <span className="font-semibold text-violet-400">£{p.budget.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
