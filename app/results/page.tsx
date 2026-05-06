'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Player = { id: string; name: string; role: string; sold_price: number | null; sold_to: string | null; status: string }
type Profile = { id: string; team_name: string; budget: number }

const roleStyles: Record<string, string> = {
  batsman: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  bowler: 'bg-red-500/20 text-red-400 border border-red-500/30',
  'all-rounder': 'bg-violet-500/20 text-violet-400 border border-violet-500/30',
  'wicket-keeper': 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
}

export default function ResultsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [players, setPlayers] = useState<Player[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const [{ data: playersData }, { data: profilesData }] = await Promise.all([
        supabase.from('players').select('*').order('auction_order'),
        supabase.from('profiles').select('*').order('budget', { ascending: false }),
      ])

      setPlayers(playersData ?? [])
      setProfiles(profilesData ?? [])
    }
    load()
  }, [supabase, router])

  const profileMap = Object.fromEntries(profiles.map(p => [p.id, p]))
  const unsoldPlayers = players.filter(p => p.status === 'unsold')
  const soldPlayers = players.filter(p => p.status === 'sold')

  return (
    <div className="min-h-screen bg-[#13151a] text-white">
      <header className="bg-[#1a1d24] border-b border-[#2d3139] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center font-bold text-sm">CA</div>
          <span className="font-bold text-lg tracking-tight">Auction Results</span>
        </div>
        <button
          onClick={() => router.push('/auction')}
          className="text-xs text-[#8b8fa8] hover:text-white px-3 py-1.5 rounded-lg hover:bg-[#252830] transition-colors"
        >
          Back to Auction
        </button>
      </header>

      <div className="max-w-5xl mx-auto p-6 space-y-6">

        {/* Team squads */}
        <div>
          <h2 className="text-sm font-semibold text-[#8b8fa8] uppercase tracking-widest mb-4">Team Squads</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {profiles.map(profile => {
              const squad = players.filter(p => p.sold_to === profile.id)
              const spent = 100000 - profile.budget
              return (
                <div key={profile.id} className="bg-[#1a1d24] border border-[#2d3139] rounded-2xl p-5">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-bold text-lg">{profile.team_name || profile.id}</h3>
                    <div className="text-right">
                      <p className="text-xs text-[#8b8fa8]">Spent <span className="text-white font-semibold">£{spent.toLocaleString()}</span></p>
                      <p className="text-xs text-[#8b8fa8]">Left <span className="text-violet-400 font-semibold">£{profile.budget.toLocaleString()}</span></p>
                    </div>
                  </div>
                  {squad.length === 0 ? (
                    <p className="text-[#8b8fa8] text-sm">No players won</p>
                  ) : (
                    <div className="space-y-2">
                      {squad.map(p => (
                        <div key={p.id} className="flex items-center justify-between bg-[#252830] rounded-xl px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${roleStyles[p.role] ?? 'bg-gray-500/20 text-gray-400'}`}>{p.role}</span>
                            <span className="font-medium text-sm">{p.name}</span>
                          </div>
                          <span className="text-sm font-semibold text-violet-400">£{p.sold_price?.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Full results table */}
        <div>
          <h2 className="text-sm font-semibold text-[#8b8fa8] uppercase tracking-widest mb-4">Full Results</h2>
          <div className="bg-[#1a1d24] border border-[#2d3139] rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2d3139]">
                  <th className="px-5 py-3 text-left text-xs text-[#8b8fa8] uppercase tracking-wider">Player</th>
                  <th className="px-5 py-3 text-left text-xs text-[#8b8fa8] uppercase tracking-wider">Role</th>
                  <th className="px-5 py-3 text-left text-xs text-[#8b8fa8] uppercase tracking-wider">Won By</th>
                  <th className="px-5 py-3 text-right text-xs text-[#8b8fa8] uppercase tracking-wider">Price</th>
                </tr>
              </thead>
              <tbody>
                {soldPlayers.map((p, i) => (
                  <tr key={p.id} className={`border-b border-[#2d3139] ${i % 2 === 0 ? '' : 'bg-[#252830]/30'}`}>
                    <td className="px-5 py-3 font-medium">{p.name}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${roleStyles[p.role] ?? 'bg-gray-500/20 text-gray-400'}`}>{p.role}</span>
                    </td>
                    <td className="px-5 py-3 text-[#8b8fa8]">{p.sold_to ? profileMap[p.sold_to]?.team_name : '—'}</td>
                    <td className="px-5 py-3 text-right font-semibold text-violet-400">£{p.sold_price?.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Unsold players */}
        {unsoldPlayers.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-[#8b8fa8] uppercase tracking-widest mb-4">Unsold Players</h2>
            <div className="bg-[#1a1d24] border border-[#2d3139] rounded-2xl overflow-hidden">
              {unsoldPlayers.map((p, i) => (
                <div key={p.id} className={`flex items-center gap-3 px-5 py-3 ${i !== 0 ? 'border-t border-[#2d3139]' : ''}`}>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${roleStyles[p.role] ?? 'bg-gray-500/20 text-gray-400'}`}>{p.role}</span>
                  <span className="font-medium text-[#8b8fa8]">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
