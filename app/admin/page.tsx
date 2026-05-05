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

  if (loading) return <div className="p-8 text-center">Loading...</div>

  const totalPlayers = players.length
  const soldPlayers = players.filter(p => p.status === 'sold').length

  return (
    <div className="min-h-screen">
      <header className="bg-green-700 text-white px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Admin Panel</h1>
        <button onClick={() => router.push('/auction')} className="text-sm opacity-75 hover:opacity-100">
          Back to Auction Room
        </button>
      </header>

      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow p-5">
            <p className="text-gray-500 text-sm">Teams</p>
            <p className="text-3xl font-bold mt-1">{profiles.length}</p>
          </div>
          <div className="bg-white rounded-xl shadow p-5">
            <p className="text-gray-500 text-sm">Players</p>
            <p className="text-3xl font-bold mt-1">{totalPlayers}</p>
          </div>
          <div className="bg-white rounded-xl shadow p-5">
            <p className="text-gray-500 text-sm">Sold</p>
            <p className="text-3xl font-bold mt-1">{soldPlayers} / {totalPlayers}</p>
          </div>
        </div>

        {/* Nav to sub-pages */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => router.push('/admin/players')}
            className="bg-white rounded-xl shadow p-6 text-left hover:shadow-md transition-shadow"
          >
            <h2 className="text-lg font-bold mb-1">Manage Players</h2>
            <p className="text-gray-500 text-sm">Add players, set roles, and order the auction</p>
          </button>
          <button
            onClick={() => router.push('/admin/auction')}
            className="bg-white rounded-xl shadow p-6 text-left hover:shadow-md transition-shadow"
          >
            <h2 className="text-lg font-bold mb-1">Control Auction</h2>
            <p className="text-gray-500 text-sm">Start, pause, move to next player, close bidding</p>
          </button>
        </div>

        {/* Team list */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="font-bold mb-4">Teams</h2>
          <div className="space-y-2">
            {profiles.map(p => (
              <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                <div>
                  <p className="font-medium">{p.team_name || p.email}</p>
                  <p className="text-xs text-gray-400">{p.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  {p.is_admin && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Admin</span>}
                  <span className="font-semibold">£{p.budget.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
