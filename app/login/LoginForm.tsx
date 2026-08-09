'use client'

import { useState } from 'react'

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/request-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong.')
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
    setBusy(false)
  }

  if (sent) {
    return (
      <div className="mt-5 rounded-lg border border-green-100 bg-green-50 px-3 py-3 text-sm text-green-700">
        If that address has access, a sign-in link is on its way. Check your
        inbox (and spam) — the link works once and expires quickly.
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-3">
      {error && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
      <input
        type="email"
        required
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"
      />
      <button
        type="submit"
        disabled={busy || !email.trim()}
        className="w-full rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-600 disabled:opacity-50"
      >
        {busy ? 'Sending…' : 'Email me a sign-in link'}
      </button>
    </form>
  )
}
