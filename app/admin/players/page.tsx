'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Player = { id: string; name: string; role: string; team: string; base_price: number; auction_order: number; status: string }
type CsvRow = { name: string; role: string; team: string; error?: string }
const ROLES = ['batsman', 'bowler', 'all-rounder', 'wicket-keeper']
const titleCase = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase())

const roleStyles: Record<string, string> = {
  batsman: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  bowler: 'bg-red-500/20 text-red-400 border border-red-500/30',
  'all-rounder': 'bg-violet-500/20 text-violet-400 border border-violet-500/30',
  'wicket-keeper': 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
}

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
      name, role, team, base_price: 1000, auction_order: nextOrder,
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
    const a = players[index - 1], b = players[index]
    await Promise.all([
      supabase.from('players').update({ auction_order: b.auction_order }).eq('id', a.id),
      supabase.from('players').update({ auction_order: a.auction_order }).eq('id', b.id),
    ])
    load()
  }

  async function moveDown(index: number) {
    if (index === players.length - 1) return
    const a = players[index], b = players[index + 1]
    await Promise.all([
      supabase.from('players').update({ auction_order: b.auction_order }).eq('id', a.id),
      supabase.from('players').update({ auction_order: a.auction_order }).eq('id', b.id),
    ])
    load()
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    setCsvError(''); setCsvRows([])
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
        setCsvError('CSV must have columns: name, role, team'); return
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
    setCsvLoading(true); setCsvError('')

    const startOrder = players.length > 0 ? Math.max(...players.map(p => p.auction_order ?? 0)) + 1 : 1
    const inserts = valid.map((r, i) => ({ name: r.name, role: r.role, team: r.team, base_price: 1000, auction_order: startOrder + i }))

    const { error: err } = await supabase.from('players').insert(inserts)
    if (err) { setCsvError(err.message) }
    else { setCsvRows([]); if (fileRef.current) fileRef.current.value = ''; await load() }
    setCsvLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#13151a] text-white">
      <header className="bg-[#1a1d24] border-b border-[#2d3139] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center font-bold text-sm">CA</div>
          <span className="font-bold text-lg tracking-tight">Manage Players</span>
        </div>
        <button
          onClick={() => router.push('/admin')}
          className="text-xs text-[#8b8fa8] hover:text-white px-3 py-1.5 rounded-lg hover:bg-[#252830] transition-colors"
        >
          Back
        </button>
      </header>

      <div className="max-w-3xl mx-auto p-6 space-y-4">

        {/* Add player */}
        <div className="bg-[#1a1d24] border border-[#2d3139] rounded-2xl p-6">
          <h2 className="font-bold mb-4">Add Player</h2>
          <form onSubmit={addPlayer} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Player name"
              required
              className="bg-[#252830] border border-[#2d3139] rounded-xl px-4 py-2.5 text-white placeholder-[#8b8fa8] focus:outline-none focus:border-violet-500 transition-colors"
            />
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="bg-[#252830] border border-[#2d3139] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-violet-500 transition-colors"
            >
              {ROLES.map(r => <option key={r} value={r}>{titleCase(r)}</option>)}
            </select>
            <input
              value={team}
              onChange={e => setTeam(e.target.value)}
              placeholder="Team"
              required
              className="bg-[#252830] border border-[#2d3139] rounded-xl px-4 py-2.5 text-white placeholder-[#8b8fa8] focus:outline-none focus:border-violet-500 transition-colors"
            />
            <button
              type="submit"
              disabled={loading}
              className="md:col-span-3 bg-violet-600 hover:bg-violet-700 text-white py-2.5 rounded-xl font-semibold transition-colors disabled:opacity-50"
            >
              Add Player
            </button>
          </form>
          {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
        </div>

        {/* CSV upload */}
        <div className="bg-[#1a1d24] border border-[#2d3139] rounded-2xl p-6">
          <h2 className="font-bold mb-1">Bulk Upload via CSV</h2>
          <p className="text-xs text-[#8b8fa8] mb-4">CSV must have headers: <code className="bg-[#252830] px-1.5 py-0.5 rounded text-violet-400">name, role, team</code></p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            onChange={handleCsvFile}
            className="block w-full text-sm text-[#8b8fa8] file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-violet-600 file:text-white hover:file:bg-violet-700 file:cursor-pointer file:transition-colors"
          />

          {csvRows.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-sm text-[#8b8fa8]">
                Preview: <span className="font-medium text-emerald-400">{csvRows.filter(r => !r.error).length} valid</span>
                {csvRows.some(r => r.error) && <span className="font-medium text-red-400 ml-2">{csvRows.filter(r => r.error).length} invalid (will be skipped)</span>}
              </p>
              <div className="max-h-48 overflow-y-auto border border-[#2d3139] rounded-xl divide-y divide-[#2d3139] text-sm">
                {csvRows.map((r, i) => (
                  <div key={i} className={`flex items-center gap-3 px-3 py-2 ${r.error ? 'bg-red-500/10' : 'bg-[#252830]'}`}>
                    <span className="flex-1 font-medium">{r.name || <span className="text-[#8b8fa8]">—</span>}</span>
                    <span className="text-xs text-[#8b8fa8]">{r.team}</span>
                    <span className="text-xs text-[#8b8fa8]">{titleCase(r.role)}</span>
                    {r.error && <span className="text-xs text-red-400">{r.error}</span>}
                  </div>
                ))}
              </div>
              <button
                onClick={uploadCsv}
                disabled={csvLoading || csvRows.every(r => !!r.error)}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white py-2.5 rounded-xl font-semibold transition-colors disabled:opacity-50"
              >
                {csvLoading ? 'Uploading…' : `Upload ${csvRows.filter(r => !r.error).length} players`}
              </button>
            </div>
          )}
          {csvError && <p className="text-red-400 text-sm mt-2">{csvError}</p>}
        </div>

        {/* Player list */}
        <div className="bg-[#1a1d24] border border-[#2d3139] rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-[#8b8fa8] uppercase tracking-widest mb-4">Auction Order ({players.length} players)</h2>
          {players.length === 0 ? (
            <p className="text-[#8b8fa8] text-sm">No players added yet</p>
          ) : (
            <div className="space-y-2">
              {players.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 bg-[#252830] rounded-xl px-4 py-3">
                  <span className="text-[#8b8fa8] text-sm w-6 text-center tabular-nums">{i + 1}</span>
                  <div className="flex-1 flex items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${roleStyles[p.role] ?? 'bg-gray-500/20 text-gray-400'}`}>{titleCase(p.role)}</span>
                    {p.team && <span className="text-xs text-[#8b8fa8]">{p.team}</span>}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => moveUp(i)} disabled={i === 0} className="p-1.5 hover:bg-[#2d3139] rounded-lg disabled:opacity-30 transition-colors text-[#8b8fa8] hover:text-white">↑</button>
                    <button onClick={() => moveDown(i)} disabled={i === players.length - 1} className="p-1.5 hover:bg-[#2d3139] rounded-lg disabled:opacity-30 transition-colors text-[#8b8fa8] hover:text-white">↓</button>
                    <button onClick={() => deletePlayer(p.id)} className="p-1.5 hover:bg-red-500/20 text-[#8b8fa8] hover:text-red-400 rounded-lg transition-colors text-sm">✕</button>
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
