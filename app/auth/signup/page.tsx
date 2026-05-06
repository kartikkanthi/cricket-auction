'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [teamName, setTeamName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { data, error: signUpError } = await supabase.auth.signUp({ email, password })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    if (data.user) {
      await supabase
        .from('profiles')
        .update({ team_name: teamName })
        .eq('id', data.user.id)
    }

    router.push('/auction')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[#13151a] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center font-bold">CA</div>
          <span className="text-2xl font-bold text-white tracking-tight">Cricket Auction</span>
        </div>

        <div className="bg-[#1a1d24] border border-[#2d3139] rounded-2xl p-8">
          <h1 className="text-xl font-bold text-white mb-1">Create your account</h1>
          <p className="text-[#8b8fa8] text-sm mb-6">Set up your manager profile</p>

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#8b8fa8] mb-1.5">Team Name</label>
              <input
                type="text"
                value={teamName}
                onChange={e => setTeamName(e.target.value)}
                required
                placeholder="e.g. Mumbai Mavericks"
                className="w-full bg-[#252830] border border-[#2d3139] rounded-xl px-4 py-3 text-white placeholder-[#8b8fa8] focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#8b8fa8] mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full bg-[#252830] border border-[#2d3139] rounded-xl px-4 py-3 text-white placeholder-[#8b8fa8] focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#8b8fa8] mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-[#252830] border border-[#2d3139] rounded-xl px-4 py-3 text-white placeholder-[#8b8fa8] focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-violet-600 hover:bg-violet-700 text-white py-3 rounded-xl font-semibold transition-colors disabled:opacity-50"
            >
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sm text-[#8b8fa8] mt-6">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-violet-400 font-medium hover:text-violet-300 transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
