'use client'

import { useState, useEffect, useCallback } from 'react'

interface Member {
  id: string
  name: string
  initials: string
  peloton_username: string
  is_owner: boolean
  active: boolean
  workout_count: number
  last_sync: { completed_at: string; status: string } | null
}

export default function AdminPage() {
  const [secret, setSecret] = useState('')
  const [authed, setAuthed] = useState(false)
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(false)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    initials: '',
    peloton_username: '',
    peloton_bearer_token: '',
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const loadMembers = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/members', {
      headers: { Authorization: `Bearer ${secret}` },
    })
    if (res.ok) {
      const data = await res.json()
      setMembers(data.members)
    }
    setLoading(false)
  }, [secret])

  useEffect(() => {
    if (authed) loadMembers()
  }, [authed, loadMembers])

  // Auto-generate initials from name
  function handleNameChange(name: string) {
    const parts = name.trim().split(' ')
    const initials =
      parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : name.slice(0, 2).toUpperCase()
    setForm((f) => ({ ...f, name, initials }))
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setFormSuccess(null)
    setSubmitting(true)

    const res = await fetch('/api/members', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(form),
    })

    const data = await res.json()

    if (!res.ok) {
      setFormError(data.error)
    } else {
      setFormSuccess(`${form.name} added successfully. Trigger a sync to pull their history.`)
      setForm({ name: '', initials: '', peloton_username: '', peloton_bearer_token: '' })
      loadMembers()
    }

    setSubmitting(false)
  }

  async function triggerSync(memberId?: string) {
    setSyncStatus('Syncing...')
    const url = memberId ? `/api/sync?memberId=${memberId}` : '/api/sync'
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
    })
    const data = await res.json()

    if (res.ok) {
      const total = data.total_workouts_added ?? data.results?.[0]?.workoutsAdded ?? 0
      setSyncStatus(`Done — ${total} new workout${total !== 1 ? 's' : ''} added`)
      loadMembers()
    } else {
      setSyncStatus(`Error: ${data.error}`)
    }

    setTimeout(() => setSyncStatus(null), 5000)
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white rounded-2xl border border-gray-100 p-8 w-full max-w-sm">
          <h1 className="text-lg font-medium text-gray-900 mb-6">Admin access</h1>
          <input
            type="password"
            placeholder="Enter your CRON_SECRET"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:ring-2 focus:ring-purple-200"
            onKeyDown={(e) => e.key === 'Enter' && setAuthed(true)}
          />
          <button
            onClick={() => setAuthed(true)}
            className="w-full bg-purple-500 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-purple-600 transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-lg font-medium text-gray-900">Admin</h1>
        <a href="/" className="text-sm text-gray-400 hover:text-gray-600">
          View leaderboard →
        </a>
      </div>

      {/* Sync controls */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-medium text-gray-900">Sync workouts</h2>
          {syncStatus && (
            <span
              className={`text-xs ${
                syncStatus.startsWith('Error') ? 'text-red-500' : 'text-green-600'
              }`}
            >
              {syncStatus}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 mb-4">
          Runs automatically daily at 6am. Use this to sync manually.
        </p>
        <button
          onClick={() => triggerSync()}
          className="text-sm border border-gray-200 rounded-lg px-4 py-2 hover:bg-gray-50 transition-colors"
        >
          Sync all members
        </button>
      </div>

      {/* Add member form */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
        <h2 className="text-sm font-medium text-gray-900 mb-1">Add a member</h2>
        <p className="text-xs text-gray-400 mb-4">
          Their Peloton bearer token is verified before being saved.
        </p>

        {formError && (
          <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-xs text-red-700 mb-4">
            {formError}
          </div>
        )}
        {formSuccess && (
          <div className="bg-green-50 border border-green-100 rounded-lg px-3 py-2 text-xs text-green-700 mb-4">
            {formSuccess}
          </div>
        )}

        <form onSubmit={handleAddMember} className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">Full name</label>
              <input
                required
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Sarah Kim"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"
              />
            </div>
            <div className="w-20">
              <label className="block text-xs text-gray-400 mb-1">Initials</label>
              <input
                required
                maxLength={2}
                value={form.initials}
                onChange={(e) => setForm((f) => ({ ...f, initials: e.target.value.toUpperCase() }))}
                placeholder="SK"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Peloton username</label>
            <input
              required
              value={form.peloton_username}
              onChange={(e) =>
                setForm((f) => ({ ...f, peloton_username: e.target.value.trim() }))
              }
              placeholder="sarah.kim"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Peloton bearer token
            </label>
            <input
              required
              type="password"
              value={form.peloton_bearer_token}
              onChange={(e) =>
                setForm((f) => ({ ...f, peloton_bearer_token: e.target.value }))
              }
              placeholder="eyJhbGciOi..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-purple-200"
            />
            <details className="mt-2">
              <summary className="text-xs text-purple-500 cursor-pointer hover:text-purple-600">
                How to get the bearer token
              </summary>
              <ol className="mt-2 text-xs text-gray-500 space-y-1 list-decimal list-inside">
                <li>Log in to <strong>onepeloton.com</strong> in your browser</li>
                <li>Open DevTools (F12) and go to the <strong>Network</strong> tab</li>
                <li>Reload the page or navigate to any section</li>
                <li>Click any request to <strong>api.onepeloton.com</strong></li>
                <li>In the request headers, find <strong>Authorization</strong> and copy its value</li>
              </ol>
            </details>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-purple-500 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-purple-600 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Verifying token with Peloton...' : 'Add member'}
          </button>
        </form>
      </div>

      {/* Member list */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h2 className="text-sm font-medium text-gray-900">
            Members ({members.length})
          </h2>
        </div>

        {loading ? (
          <div className="px-5 py-8 text-center text-xs text-gray-300">Loading...</div>
        ) : members.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-gray-300">
            No members yet. Add one above.
          </div>
        ) : (
          members.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 px-5 py-3 border-b border-gray-50 last:border-0"
            >
              <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-800 flex items-center justify-center text-xs font-medium flex-shrink-0">
                {member.initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-gray-800">{member.name}</span>
                  {member.is_owner && (
                    <span className="text-xs bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-full">
                      owner
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-400">
                  @{member.peloton_username} · {member.workout_count} workouts
                  {member.last_sync && (
                    <>
                      {' · '}
                      <span
                        className={
                          member.last_sync.status === 'error'
                            ? 'text-red-400'
                            : 'text-gray-400'
                        }
                      >
                        {member.last_sync.status === 'error' ? 'sync error' : 'synced'}{' '}
                        {new Date(member.last_sync.completed_at).toLocaleDateString()}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={() => triggerSync(member.id)}
                className="text-xs text-gray-400 hover:text-purple-500 transition-colors flex-shrink-0"
              >
                sync
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
