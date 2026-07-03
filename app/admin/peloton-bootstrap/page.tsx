'use client'

import { useState } from 'react'
import Link from 'next/link'
import Breadcrumbs from '@/app/components/Breadcrumbs'

interface BootstrapResponse {
  ok: boolean
  message: string
  warning?: string | null
}

export default function PelotonBootstrapPage() {
  const [secret, setSecret] = useState('')
  const [authed, setAuthed] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authChecking, setAuthChecking] = useState(false)

  const [accessToken, setAccessToken] = useState('')
  const [refreshToken, setRefreshToken] = useState('')
  const [clientId, setClientId] = useState('')
  const [bundleJson, setBundleJson] = useState('')
  const [bundleError, setBundleError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<BootstrapResponse | null>(null)

  function parseBundle(text: string) {
    setBundleJson(text)
    setBundleError(null)
    const trimmed = text.trim()
    if (!trimmed) return
    try {
      const parsed = JSON.parse(trimmed)
      const at = typeof parsed?.access_token === 'string' ? parsed.access_token : ''
      const rt = typeof parsed?.refresh_token === 'string' ? parsed.refresh_token : ''
      const cid = typeof parsed?.client_id === 'string' ? parsed.client_id : ''
      if (!at) {
        setBundleError('Bundle is missing "access_token".')
        return
      }
      setAccessToken(at)
      setRefreshToken(rt)
      setClientId(cid)
    } catch {
      setBundleError('Not valid JSON — check the copied text.')
    }
  }

  async function handleAuthSubmit() {
    if (!secret.trim()) {
      setAuthError('Enter the CRON_SECRET.')
      return
    }
    setAuthChecking(true)
    setAuthError(null)
    // Cheap probe: /api/admin/health uses the same CRON_SECRET gate.
    const res = await fetch('/api/admin/health', {
      headers: { Authorization: `Bearer ${secret}` },
    })
    if (res.ok) {
      setAuthed(true)
    } else {
      setAuthError('Incorrect secret — try again.')
    }
    setAuthChecking(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/peloton-bootstrap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({
          access_token: accessToken.trim(),
          refresh_token: refreshToken.trim() || null,
          client_id: clientId.trim() || null,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setResult({
          ok: true,
          message: `Stored for ${data.owner_name}. Refresh flow ${
            data.refresh_enabled ? 'ENABLED' : 'DORMANT'
          }.`,
          warning: data.warning,
        })
        setAccessToken('')
        setRefreshToken('')
        setClientId('')
      } else {
        setResult({ ok: false, message: data.error ?? 'Bootstrap failed' })
      }
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : String(e) })
    }
    setSubmitting(false)
  }

  if (!authed) {
    return (
      <div className="mx-auto max-w-3xl">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Peloton bootstrap' },
          ]}
        />
        <div className="ring-card mx-auto mt-6 w-full max-w-sm rounded-3xl border border-gray-100 bg-white p-8">
          <h1 className="mb-1 text-xl font-semibold text-gray-900">Admin access</h1>
          <p className="mb-6 text-xs text-gray-500">
            Enter the CRON_SECRET to bootstrap Peloton credentials.
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

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Admin', href: '/admin' },
          { label: 'Peloton bootstrap' },
        ]}
      />

      <div className="mb-6 mt-2">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
          Peloton bootstrap
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Store the owner&apos;s Auth0 token bundle. With refresh_token + client_id, the app refreshes automatically.
        </p>
      </div>

      {result && (
        <div
          className={`mb-4 rounded-2xl border px-4 py-3 ${
            result.ok ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'
          }`}
        >
          <div
            className={`text-sm font-medium ${
              result.ok ? 'text-green-800' : 'text-red-800'
            }`}
          >
            {result.message}
          </div>
          {result.warning && (
            <div className="text-xs text-amber-700 mt-2">{result.warning}</div>
          )}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4"
      >
        <div>
          <label className="block text-xs text-gray-400 mb-1">
            Paste bundle JSON (from bookmarklet)
          </label>
          <textarea
            value={bundleJson}
            onChange={(e) => parseBundle(e.target.value)}
            placeholder='{"access_token":"...","refresh_token":"...","client_id":"..."}'
            rows={4}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono outline-none focus:ring-2 focus:ring-purple-200"
          />
          {bundleError ? (
            <p className="mt-1 text-xs text-red-600">{bundleError}</p>
          ) : (
            <p className="mt-1 text-xs text-gray-400">
              Paste the JSON from the bookmarklet or DevTools snippet — the three fields below fill in automatically.
            </p>
          )}
        </div>

        <div className="border-t border-gray-100 pt-4" />

        <div>
          <label className="block text-xs text-gray-400 mb-1">Access token (required)</label>
          <input
            required
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder="eyJhbGciOi…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-purple-200"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Refresh token (recommended)</label>
          <input
            type="password"
            value={refreshToken}
            onChange={(e) => setRefreshToken(e.target.value)}
            placeholder="v1.M…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-purple-200"
          />
          <p className="mt-1 text-xs text-gray-400">
            Optional, but without it the access token can&apos;t auto-refresh.
          </p>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Auth0 client_id (recommended)</label>
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="abc123…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-purple-200"
          />
          <p className="mt-1 text-xs text-gray-400">
            Required together with the refresh token to enable auto-refresh.
          </p>
        </div>

        <details>
          <summary className="text-xs text-purple-500 cursor-pointer hover:text-purple-600">
            How to capture all three from members.onepeloton.com
          </summary>
          <ol className="mt-2 text-xs text-gray-500 space-y-1 list-decimal list-inside">
            <li>Log in to <strong>members.onepeloton.com</strong>.</li>
            <li>
              Open DevTools (F12) → <strong>Application</strong> → <strong>Local Storage</strong> →{' '}
              <code>https://members.onepeloton.com</code>.
            </li>
            <li>
              Find a key starting with <code>@@auth0spajs@@</code>. The value is JSON.
            </li>
            <li>
              Copy <code>body.access_token</code>, <code>body.refresh_token</code>, and the{' '}
              <code>client_id</code> (in the key segment after <code>@@auth0spajs@@::</code>, or inside the blob).
            </li>
          </ol>
          <p className="mt-2 text-xs text-gray-500">
            Or use the iOS Shortcut from <code>docs/ios-shortcut-bootstrap.md</code> — one tap from Safari and you&apos;re done.
          </p>
        </details>

        <button
          type="submit"
          disabled={submitting || !accessToken.trim()}
          className="text-sm border border-gray-200 rounded-lg px-4 py-2 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Validating…' : 'Bootstrap'}
        </button>
      </form>

      <p className="mt-4 text-xs text-gray-400">
        <Link href="/admin" className="text-purple-500 hover:text-purple-600">
          ← back to admin
        </Link>
      </p>
    </div>
  )
}
