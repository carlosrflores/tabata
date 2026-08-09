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
  // The /admin layout gates access server-side; session cookies
  // authenticate the API call. (The iOS Shortcut still POSTs to the API
  // directly with CRON_SECRET — that path is untouched.)
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/peloton-bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
          <div className="mt-2 space-y-3">
            <div>
              <p className="text-xs text-gray-500 mb-1">
                <strong>Fastest (desktop):</strong> sign in to{' '}
                <code>members.onepeloton.com</code>, open DevTools (F12) →{' '}
                <strong>Console</strong>, paste this snippet, then paste your
                clipboard into the textarea above.
              </p>
              <pre className="rounded-lg bg-gray-50 border border-gray-100 p-3 text-[10px] font-mono text-gray-700 overflow-x-auto whitespace-pre-wrap break-all">
                <code>{`copy(JSON.stringify((()=>{for(const k of Object.keys(localStorage).filter(x=>x.startsWith('@@auth0spajs@@::'))){const b=JSON.parse(localStorage.getItem(k));const body=b?.body??b;if(body?.access_token)return{source:'localStorage',access_token:body.access_token,refresh_token:body.refresh_token??null,client_id:body.client_id??k.split('::')[1]??null,expires_at:body.expires_at??b.expiresAt??null};}return null;})(),null,2));console.log('Bundle copied.');`}</code>
              </pre>
              <p className="mt-1 text-[10px] text-gray-400">
                The snippet iterates all <code>@@auth0spajs@@</code> keys and
                picks the one that actually has <code>body.access_token</code> —
                a plain <code>[0]</code> picks the wrong blob (user info,
                no tokens).
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-1"><strong>Manual fallback:</strong></p>
              <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
                <li>Log in to <strong>members.onepeloton.com</strong>.</li>
                <li>
                  Open DevTools (F12) → <strong>Application</strong> → <strong>Local Storage</strong> →{' '}
                  <code>https://members.onepeloton.com</code>.
                </li>
                <li>
                  Find the <code>@@auth0spajs@@</code> entry whose value has a{' '}
                  <code>body.access_token</code> field. There are usually two —
                  you want the one with a <code>body</code> wrapper, not the
                  plain user-info blob.
                </li>
                <li>
                  Copy <code>body.access_token</code>, <code>body.refresh_token</code>, and{' '}
                  <code>body.client_id</code>.
                </li>
              </ol>
            </div>

            <p className="text-xs text-gray-500">
              Or use the iOS Shortcut from <code>docs/ios-shortcut-bootstrap.md</code> — one tap from Safari.
            </p>
          </div>
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
