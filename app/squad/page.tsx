'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Player = { id: string; name: string; role: string; team: string; sold_price: number }
type Profile = { id: string; team_name: string; budget: number }

const titleCase = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase())

const roleColors: Record<string, string> = {
  batsman: 'bg-blue-100 text-blue-800',
  bowler: 'bg-red-100 text-red-800',
  'all-rounder': 'bg-purple-100 text-purple-800',
  'wicket-keeper': 'bg-yellow-100 text-yellow-800',
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
    <div className="min-h-screen">
      <header className="bg-green-700 text-white px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">My Squad</h1>
        <button onClick={() => router.push('/auction')} className="text-sm opacity-75 hover:opacity-100">
          Back to Auction
        </button>
      </header>

      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Budget summary */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="font-bold text-lg mb-4">{me?.team_name}</h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-sm text-gray-500">Players</p>
              <p className="text-2xl font-bold">{players.length}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Spent</p>
              <p className="text-2xl font-bold">£{totalSpent.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Remaining</p>
              <p className="text-2xl font-bold text-green-600">£{me?.budget.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Player list */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="font-bold mb-4">Players</h2>
          {players.length === 0 ? (
            <p className="text-gray-400 text-sm">You haven&apos;t won any players yet</p>
          ) : (
            <div className="space-y-3">
              {players.map(p => (
                <div key={p.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-3">
                  <div className="flex-1">
                    <p className="font-medium">{p.name}</p>
                    {p.team && <p className="text-xs text-gray-400">{p.team}</p>}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${roleColors[p.role] ?? 'bg-gray-100'}`}>
                    {titleCase(p.role)}
                  </span>
                  <span className="text-sm font-semibold">£{p.sold_price?.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
