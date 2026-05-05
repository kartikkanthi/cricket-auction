'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Player = { id: string; name: string; role: string; sold_price: number | null; sold_to: string | null; status: string }
type Profile = { id: string; team_name: string; budget: number }

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

  const roleColors: Record<string, string> = {
    batsman: 'bg-blue-100 text-blue-800',
    bowler: 'bg-red-100 text-red-800',
    'all-rounder': 'bg-purple-100 text-purple-800',
    'wicket-keeper': 'bg-yellow-100 text-yellow-800',
  }

  return (
    <div className="min-h-screen">
      <header className="bg-green-700 text-white px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Auction Results</h1>
        <button onClick={() => router.push('/auction')} className="text-sm opacity-75 hover:opacity-100">
          Back to Auction
        </button>
      </header>

      <div className="max-w-5xl mx-auto p-6 space-y-8">
        {/* Team squads */}
        <div>
          <h2 className="text-xl font-bold mb-4">Team Squads</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {profiles.map(profile => {
              const squad = players.filter(p => p.sold_to === profile.id)
              const spent = 100000 - profile.budget
              return (
                <div key={profile.id} className="bg-white rounded-xl shadow p-5">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-bold text-lg">{profile.team_name || profile.id}</h3>
                    <div className="text-right text-sm">
                      <p className="text-gray-500">Spent: <span className="font-semibold text-gray-800">£{spent.toLocaleString()}</span></p>
                      <p className="text-gray-500">Remaining: <span className="font-semibold text-green-600">£{profile.budget.toLocaleString()}</span></p>
                    </div>
                  </div>
                  {squad.length === 0 ? (
                    <p className="text-gray-400 text-sm">No players won</p>
                  ) : (
                    <div className="space-y-2">
                      {squad.map(p => (
                        <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${roleColors[p.role] ?? 'bg-gray-100'}`}>{p.role}</span>
                            <span className="font-medium text-sm">{p.name}</span>
                          </div>
                          <span className="text-sm font-semibold">£{p.sold_price?.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Unsold players */}
        {players.filter(p => p.status === 'unsold').length > 0 && (
          <div>
            <h2 className="text-xl font-bold mb-4">Unsold Players</h2>
            <div className="bg-white rounded-xl shadow divide-y">
              {players.filter(p => p.status === 'unsold').map(p => (
                <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${roleColors[p.role] ?? 'bg-gray-100'}`}>{p.role}</span>
                  <span className="font-medium">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Full results table */}
        <div>
          <h2 className="text-xl font-bold mb-4">Full Results</h2>
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-5 py-3 text-left">Player</th>
                  <th className="px-5 py-3 text-left">Role</th>
                  <th className="px-5 py-3 text-left">Won By</th>
                  <th className="px-5 py-3 text-right">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {players.filter(p => p.status === 'sold').map(p => (
                  <tr key={p.id}>
                    <td className="px-5 py-3 font-medium">{p.name}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${roleColors[p.role] ?? 'bg-gray-100'}`}>{p.role}</span>
                    </td>
                    <td className="px-5 py-3">{p.sold_to ? profileMap[p.sold_to]?.team_name : '-'}</td>
                    <td className="px-5 py-3 text-right font-semibold">£{p.sold_price?.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
