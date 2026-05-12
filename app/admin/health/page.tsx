'use client'

import { useState, useEffect, useCallback } from 'react'
import Breadcrumbs from '@/app/components/Breadcrumbs'

interface SyncRun {
  id: string
  started_at: string
  finished_at: string | null
  trigger: string
  status: string
  members_processed: number
  members_failed: number
  workouts_added: number
  last_error: string | null
  token_expires_at: string | null
  duration_ms: number | null
}

const STALE_HOURS = 36
const TOKEN_WARNING_HOURS = 8

function formatDuration(ms: number | null): string {
  if (ms == null) return '—'
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.round((ms % 60_000) / 1000)
  return `${m}m ${s}s`
}

function statusBadge(status: string): string {
  if (status === 'success') return 'text-green-700 bg-green-50 border-green-100'
  if (status === 'running') return 'text-gray-700 bg-gray-50 border-gray-200'
  if (status === 'partial') return 'text-amber-700 bg-amber-50 border-amber-100'
  return 'text-red-700 bg-red-50 border-red-100'
}

export default function HealthPage() {
  const [secret, setSecret] = useState('')
  const [authed, setAuthed] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authChecking, setAuthChecking] = useState(false)
  const [runs, setRuns] = useState<SyncRun[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)

  const loadRuns = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/health', {
      headers: { Authorization: `Bearer ${secret}` },
    })
    if (res.ok) {
      const data = await res.json()
      setRuns(data.runs ?? [])
    }
    setLoading(false)
  }, [secret])

  useEffect(() => {
    if (authed) loadRuns()
  }, [authed, loadRuns])

  async function handleAuthSubmit() {
    if (!secret.trim()) {
      setAuthError('Enter the CRON_SECRET.')
      return
    }
    setAuthChecking(true)
    setAuthError(null)
    const res = await fetch('/api/admin/health', {
      headers: { Authorization: `Bearer ${secret}` },
    })
    if (res.ok) {
      const data = await res.json()
      setRuns(data.runs ?? [])
      setAuthed(true)
    } else {
      setAuthError('Incorrect secret — try again.')
    }
    setAuthChecking(false)
  }

  async function triggerSync() {
    setSyncing(true)
    setSyncStatus('Syncing…')
    try {
      const res = await fetch('/api/debug?mode=sync&trigger=manual', {
        headers: { Authorization: `Bearer ${secret}` },
      })
      const data = await res.json()
      if (res.ok) {
        const total = data.total_workouts_added ?? 0
        setSyncStatus(`Done — ${total} new workout${total !== 1 ? 's' : ''} added`)
        loadRuns()
      } else {
        setSyncStatus(`Error: ${data.error}`)
      }
    } catch (e) {
      setSyncStatus(`Error: ${e instanceof Error ? e.message : String(e)}`)
    }
    setSyncing(false)
    setTimeout(() => setSyncStatus(null), 6000)
  }

  if (!authed) {
    return (
      <div className="mx-auto max-w-3xl">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Health' },
          ]}
        />
        <div className="ring-card mx-auto mt-6 w-full max-w-sm rounded-3xl border border-gray-100 bg-white p-8">
          <h1 className="mb-1 text-xl font-semibold text-gray-900">Admin access</h1>
          <p className="mb-6 text-xs text-gray-500">
            Enter the CRON_SECRET to view sync health.
          </p>
          {authError && (
            <div className="mb-3 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">
              {authError}
            </div>
          )}
          <input
            type="password"
            placeholder="CRON_SECRET"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="mb-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"
            onKeyDown={(e) => e.key === 'Enter' && handleAuthSubmit()}
          />
          <button
            onClick={handleAuthSubmit}
            disabled={authChecking}
            className="w-full rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 px-4 py-2 text-sm font-medium text-white shadow transition-shadow hover:shadow-md disabled:opacity-60"
          >
            {authChecking ? 'Checking…' : 'Continue'}
          </button>
        </div>
      </div>
    )
  }

  // Banner calculations.
  const now = Date.now()
  const lastSuccess = runs.find((r) => r.status === 'success')
  const lastSuccessAgeHours = lastSuccess
    ? (now - new Date(lastSuccess.started_at).getTime()) / 3_600_000
    : null
  const isStale =
    runs.length > 0 && (lastSuccessAgeHours == null || lastSuccessAgeHours > STALE_HOURS)

  const latestTokenExp = runs.find((r) => r.token_expires_at)?.token_expires_at
  const tokenHoursLeft = latestTokenExp
    ? (new Date(latestTokenExp).getTime() - now) / 3_600_000
    : null
  const isTokenSoon = tokenHoursLeft != null && tokenHoursLeft < TOKEN_WARNING_HOURS

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Admin', href: '/admin' },
          { label: 'Health' },
        ]}
      />

      <div className="mb-6 mt-2 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
            Sync health
          </h1>
          <p className="mt-1 text-sm text-gray-500">Last 30 bulk sync runs.</p>
        </div>
      </div>

      {isStale && (
        <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 mb-4">
          <div className="text-sm font-medium text-red-800">Sync is stale</div>
          <div className="text-xs text-red-700 mt-1">
            {lastSuccess
              ? `Last successful run was ${lastSuccessAgeHours!.toFixed(1)}h ago (threshold ${STALE_HOURS}h).`
              : `No successful runs in the last 30. Trigger a sync and inspect the error column.`}
          </div>
        </div>
      )}

      {isTokenSoon && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 mb-4">
          <div className="text-sm font-medium text-amber-800">Peloton token expires soon</div>
          <div className="text-xs text-amber-700 mt-1">
            Owner token has ~{Math.max(0, tokenHoursLeft!).toFixed(1)}h left. Refresh it from the admin page before the next cron run.
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-medium text-gray-900">Trigger sync now</h2>
          {syncStatus && (
            <span className={`text-xs ${syncStatus.startsWith('Error') ? 'text-red-500' : 'text-green-600'}`}>
              {syncStatus}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 mb-4">
          Runs syncAllMembers with trigger=manual. Refreshes the table when done.
        </p>
        <button
          onClick={triggerSync}
          disabled={syncing}
          className="text-sm border border-gray-200 rounded-lg px-4 py-2 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {syncing ? 'Syncing…' : 'Sync all members'}
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-900">Recent runs</h2>
          <button
            onClick={loadRuns}
            className="text-xs text-gray-400 hover:text-purple-500 transition-colors"
          >
            refresh
          </button>
        </div>

        {loading ? (
          <div className="px-5 py-8 text-center text-xs text-gray-300">Loading…</div>
        ) : runs.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-gray-300">
            No runs recorded yet. Trigger one above or wait for the daily cron.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-50">
                  <th className="px-5 py-2 text-left font-normal">Started</th>
                  <th className="px-2 py-2 text-left font-normal">Trigger</th>
                  <th className="px-2 py-2 text-left font-normal">Status</th>
                  <th className="px-2 py-2 text-right font-normal">Members</th>
                  <th className="px-2 py-2 text-right font-normal">Workouts</th>
                  <th className="px-2 py-2 text-right font-normal">Duration</th>
                  <th className="px-5 py-2 text-left font-normal">Error</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const ok = r.members_processed - r.members_failed
                  return (
                    <tr key={r.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-5 py-2 text-gray-700 whitespace-nowrap">
                        {new Date(r.started_at).toLocaleString()}
                      </td>
                      <td className="px-2 py-2 text-gray-500">{r.trigger}</td>
                      <td className="px-2 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${statusBadge(r.status)}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right text-gray-700 font-mono">
                        {ok}/{r.members_processed}
                      </td>
                      <td className="px-2 py-2 text-right text-gray-700 font-mono">
                        {r.workouts_added}
                      </td>
                      <td className="px-2 py-2 text-right text-gray-500 font-mono whitespace-nowrap">
                        {formatDuration(r.duration_ms)}
                      </td>
                      <td
                        className="px-5 py-2 text-xs text-red-500 max-w-xs truncate"
                        title={r.last_error ?? ''}
                      >
                        {r.last_error ? r.last_error.slice(0, 100) : ''}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
