'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Player = { id: string; name: string; role: string; team: string; sold_price: number }
type Profile = { id: string; team_name: string; budget: number }

const titleCase = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase())

const roleStyles: Record<string, string> = {
  batsman: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  bowler: 'bg-red-500/20 text-red-400 border border-red-500/30',
  'all-rounder': 'bg-violet-500/20 text-violet-400 border border-violet-500/30',
  'wicket-keeper': 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
}

export default function SquadPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [me, setMe] = useState<Profile | null>(null)
  const [players, setPlayers] = useState<Player[]>([])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const [{ data: profile }, { data: playersData }] = await Promise.all([
        supabase.from('profiles').select('id, team_name, budget').eq('id', user.id).single(),
        supabase.from('players').select('id, name, role, team, sold_price').eq('sold_to', user.id).order('sold_price', { ascending: false }),
      ])

      setMe(profile)
      setPlayers(playersData ?? [])
    }
    load()
  }, [supabase, router])

  const totalSpent = players.reduce((sum, p) => sum + (p.sold_price ?? 0), 0)

  return (
    <div className="min-h-screen bg-[#13151a] text-white">
      <header className="bg-[#1a1d24] border-b border-[#2d3139] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center font-bold text-sm">CA</div>
          <span className="font-bold text-lg tracking-tight">My Squad</span>
        </div>
        <button
          onClick={() => router.push('/auction')}
          className="text-xs text-[#8b8fa8] hover:text-white px-3 py-1.5 rounded-lg hover:bg-[#252830] transition-colors"
        >
          Back to Auction
        </button>
      </header>

      <div className="max-w-2xl mx-auto p-6 space-y-4">
        {/* Budget summary */}
        <div className="bg-[#1a1d24] border border-[#2d3139] rounded-2xl p-6">
          <h2 className="font-bold text-lg mb-5">{me?.team_name}</h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-[#252830] rounded-xl p-4">
              <p className="text-xs text-[#8b8fa8] mb-1">Players</p>
              <p className="text-2xl font-bold">{players.length}</p>
            </div>
            <div className="bg-[#252830] rounded-xl p-4">
              <p className="text-xs text-[#8b8fa8] mb-1">Spent</p>
              <p className="text-2xl font-bold">£{totalSpent.toLocaleString()}</p>
            </div>
            <div className="bg-violet-600/15 border border-violet-500/30 rounded-xl p-4">
              <p className="text-xs text-[#8b8fa8] mb-1">Remaining</p>
              <p className="text-2xl font-bold text-violet-400">£{me?.budget.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Player list */}
        <div className="bg-[#1a1d24] border border-[#2d3139] rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-[#8b8fa8] uppercase tracking-widest mb-4">Players</h3>
          {players.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-[#8b8fa8] text-sm">You haven&apos;t won any players yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {players.map(p => (
                <div key={p.id} className="flex items-center gap-3 bg-[#252830] rounded-xl px-4 py-3">
                  <div className="flex-1">
                    <p className="font-medium">{p.name}</p>
                    {p.team && <p className="text-xs text-[#8b8fa8] mt-0.5">{p.team}</p>}
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${roleStyles[p.role] ?? 'bg-gray-500/20 text-gray-400'}`}>
                    {titleCase(p.role)}
                  </span>
                  <span className="text-sm font-semibold text-violet-400">£{p.sold_price?.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
