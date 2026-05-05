'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Player = { id: string; name: string; role: string; team: string; base_price: number; auction_order: number; status: string }
type CsvRow = { name: string; role: string; team: string; error?: string }
const ROLES = ['batsman', 'bowler', 'all-rounder', 'wicket-keeper']
const titleCase = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase())

export default function PlayersPage() {
  const router = useRouter()
  const supabase = createClient()
  const [players, setPlayers] = useState<Player[]>([])
  const [name, setName] = useState('')
  const [role, setRole] = useState('batsman')
  const [team, setTeam] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [csvRows, setCsvRows] = useState<CsvRow[]>([])
  const [csvError, setCsvError] = useState('')
  const [csvLoading, setCsvLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    const { data } = await supabase.from('players').select('*').order('auction_order')
    setPlayers(data ?? [])
  }

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
      if (!profile?.is_admin) { router.push('/auction'); return }
      load()
    }
    init()
  }, [supabase, router])

  async function addPlayer(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const nextOrder = players.length > 0 ? Math.max(...players.map(p => p.auction_order ?? 0)) + 1 : 1

    const { error: err } = await supabase.from('players').insert({
      name,
      role,
      team,
      base_price: 1000,
      auction_order: nextOrder,
    })

    if (err) setError(err.message)
    else { setName(''); setTeam(''); await load() }
    setLoading(false)
  }

  async function deletePlayer(id: string) {
    await supabase.from('players').delete().eq('id', id)
    load()
  }

  async function moveUp(index: number) {
    if (index === 0) return
    const updated = [...players]
    const a = updated[index - 1]
    const b = updated[index]
    await Promise.all([
      supabase.from('players').update({ auction_order: b.auction_order }).eq('id', a.id),
      supabase.from('players').update({ auction_order: a.auction_order }).eq('id', b.id),
    ])
    load()
  }

  async function moveDown(index: number) {
    if (index === players.length - 1) return
    const updated = [...players]
    const a = updated[index]
    const b = updated[index + 1]
    await Promise.all([
      supabase.from('players').update({ auction_order: b.auction_order }).eq('id', a.id),
      supabase.from('players').update({ auction_order: a.auction_order }).eq('id', b.id),
    ])
    load()
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    setCsvError('')
    setCsvRows([])
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const lines = text.trim().split(/\r?\n/)
      const header = lines[0].toLowerCase().split(',').map(h => h.trim())
      const nameIdx = header.indexOf('name')
      const roleIdx = header.indexOf('role')
      const teamIdx = header.indexOf('team')

      if (nameIdx === -1 || roleIdx === -1 || teamIdx === -1) {
        setCsvError('CSV must have columns: name, role, team')
        return
      }

      const rows: CsvRow[] = lines.slice(1).filter(l => l.trim()).map(line => {
        const cols = line.split(',').map(c => c.trim())
        const rowName = cols[nameIdx] ?? ''
        const rowRole = cols[roleIdx]?.toLowerCase() ?? ''
        const rowTeam = cols[teamIdx] ?? ''

        let rowError = ''
        if (!rowName) rowError = 'Missing name'
        else if (!ROLES.includes(rowRole)) rowError = `Invalid role "${cols[roleIdx]}"`
        else if (!rowTeam) rowError = 'Missing team'

        return { name: rowName, role: rowRole, team: rowTeam, error: rowError || undefined }
      })

      setCsvRows(rows)
    }
    reader.readAsText(file)
  }

  async function uploadCsv() {
    const valid = csvRows.filter(r => !r.error)
    if (valid.length === 0) return
    setCsvLoading(true)
    setCsvError('')

    const startOrder = players.length > 0 ? Math.max(...players.map(p => p.auction_order ?? 0)) + 1 : 1
    const inserts = valid.map((r, i) => ({
      name: r.name,
      role: r.role,
      team: r.team,
      base_price: 1000,
      auction_order: startOrder + i,
    }))

    const { error: err } = await supabase.from('players').insert(inserts)
    if (err) {
      setCsvError(err.message)
    } else {
      setCsvRows([])
      if (fileRef.current) fileRef.current.value = ''
      await load()
    }
    setCsvLoading(false)
  }

  const roleColors: Record<string, string> = {
    batsman: 'bg-blue-100 text-blue-800',
    bowler: 'bg-red-100 text-red-800',
    'all-rounder': 'bg-purple-100 text-purple-800',
    'wicket-keeper': 'bg-yellow-100 text-yellow-800',
  }

  return (
    <div className="min-h-screen">
      <header className="bg-green-700 text-white px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Manage Players</h1>
        <button onClick={() => router.push('/admin')} className="text-sm opacity-75 hover:opacity-100">Back</button>
      </header>

      <div className="max-w-3xl mx-auto p-6 space-y-6">
        {/* Add player form */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="font-bold mb-4">Add Player</h2>
          <form onSubmit={addPlayer} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Player name"
              required
              className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {ROLES.map(r => <option key={r} value={r}>{titleCase(r)}</option>)}
            </select>
            <input
              value={team}
              onChange={e => setTeam(e.target.value)}
              placeholder="Team"
              required
              className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="md:col-span-3 bg-green-600 text-white py-2 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
            >
              Add Player
            </button>
          </form>
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </div>

        {/* Bulk CSV upload */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="font-bold mb-1">Bulk Upload via CSV</h2>
          <p className="text-xs text-gray-400 mb-4">CSV must have headers: <code className="bg-gray-100 px-1 rounded">name, role, team</code></p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            onChange={handleCsvFile}
            className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
          />

          {csvRows.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-sm text-gray-600">
                Preview: <span className="font-medium text-green-700">{csvRows.filter(r => !r.error).length} valid</span>
                {csvRows.some(r => r.error) && <span className="font-medium text-red-500 ml-2">{csvRows.filter(r => r.error).length} invalid (will be skipped)</span>}
              </p>
              <div className="max-h-48 overflow-y-auto border rounded-lg divide-y text-sm">
                {csvRows.map((r, i) => (
                  <div key={i} className={`flex items-center gap-3 px-3 py-2 ${r.error ? 'bg-red-50' : 'bg-white'}`}>
                    <span className="flex-1 font-medium">{r.name || <span className="text-gray-300">—</span>}</span>
                    <span className="text-xs text-gray-500">{r.team}</span>
                    <span className="text-xs text-gray-500">{titleCase(r.role)}</span>
                    {r.error && <span className="text-xs text-red-500">{r.error}</span>}
                  </div>
                ))}
              </div>
              <button
                onClick={uploadCsv}
                disabled={csvLoading || csvRows.every(r => !!r.error)}
                className="w-full bg-green-600 text-white py-2 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {csvLoading ? 'Uploading…' : `Upload ${csvRows.filter(r => !r.error).length} players`}
              </button>
            </div>
          )}

          {csvError && <p className="text-red-500 text-sm mt-2">{csvError}</p>}
        </div>

        {/* Player list */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="font-bold mb-4">Auction Order ({players.length} players)</h2>
          {players.length === 0 ? (
            <p className="text-gray-400 text-sm">No players added yet</p>
          ) : (
            <div className="space-y-2">
              {players.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-3">
                  <span className="text-gray-400 text-sm w-6 text-center">{i + 1}</span>
                  <div className="flex-1">
                    <span className="font-medium">{p.name}</span>
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${roleColors[p.role] ?? 'bg-gray-100'}`}>{titleCase(p.role)}</span>
                    {p.team && <span className="ml-2 text-xs text-gray-400">{p.team}</span>}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => moveUp(i)} disabled={i === 0} className="p-1 hover:bg-gray-200 rounded disabled:opacity-30">↑</button>
                    <button onClick={() => moveDown(i)} disabled={i === players.length - 1} className="p-1 hover:bg-gray-200 rounded disabled:opacity-30">↓</button>
                    <button onClick={() => deletePlayer(p.id)} className="p-1 hover:bg-red-100 text-red-500 rounded text-sm">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
