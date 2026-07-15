'use client'

// /connect/<code> — self-serve Peloton token capture for a single member.
//
// Built for non-technical users: greeting by name, three numbered steps,
// one paste box, one button. No CRON_SECRET involved — the URL code is the
// credential, validated server-side by /api/connect.

import { useEffect, useState } from 'react'

const CONSOLE_SNIPPET = `copy(JSON.stringify((()=>{for(const k of Object.keys(localStorage).filter(x=>x.startsWith('@@auth0spajs@@::'))){const b=JSON.parse(localStorage.getItem(k));const body=b?.body??b;if(body?.access_token)return{source:'localStorage',access_token:body.access_token,refresh_token:body.refresh_token??null,client_id:body.client_id??k.split('::')[1]??null,expires_at:body.expires_at??b.expiresAt??null};}return null;})(),null,2));console.log('Bundle copied.');`

type Phase = 'loading' | 'invalid' | 'form' | 'done'

interface ConnectResult {
  member_name: string
  refresh_enabled: boolean
  warning: string | null
}

export default function ConnectPage({ params }: { params: { code: string } }) {
  const code = params.code

  const [phase, setPhase] = useState<Phase>('loading')
  const [memberName, setMemberName] = useState('')
  const [bundleJson, setBundleJson] = useState('')
  const [parsedOk, setParsedOk] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ConnectResult | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/connect?code=${encodeURIComponent(code)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (cancelled) return
        setMemberName(data.member_name ?? '')
        setPhase('form')
      })
      .catch(() => {
        if (!cancelled) setPhase('invalid')
      })
    return () => {
      cancelled = true
    }
  }, [code])

  function handlePaste(text: string) {
    setBundleJson(text)
    setParseError(null)
    setParsedOk(false)
    const trimmed = text.trim()
    if (!trimmed) return
    try {
      const parsed = JSON.parse(trimmed)
      if (typeof parsed?.access_token !== 'string' || !parsed.access_token) {
        setParseError(
          'That doesn’t look right — the pasted text has no access token. Redo step 2 and paste again.'
        )
        return
      }
      setParsedOk(true)
    } catch {
      setParseError(
        'That doesn’t look like the copied code. Redo step 2 and paste the whole thing.'
      )
    }
  }

  async function handleCopySnippet() {
    try {
      await navigator.clipboard.writeText(CONSOLE_SNIPPET)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Selection fallback is the <pre> itself; ignore.
    }
  }

  async function handleSubmit() {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const parsed = JSON.parse(bundleJson.trim())
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          access_token: parsed.access_token,
          refresh_token: parsed.refresh_token ?? null,
          client_id: parsed.client_id ?? null,
          expires_at: parsed.expires_at ?? null,
          source: parsed.source ?? 'localStorage',
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSubmitError(data.error ?? 'Something went wrong. Try again.')
      } else {
        setResult({
          member_name: data.member_name,
          refresh_enabled: data.refresh_enabled,
          warning: data.warning,
        })
        setPhase('done')
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e))
    }
    setSubmitting(false)
  }

  if (phase === 'loading') {
    return (
      <div className="mx-auto mt-16 max-w-md px-4 text-center text-sm text-gray-400">
        Loading…
      </div>
    )
  }

  if (phase === 'invalid') {
    return (
      <div className="mx-auto mt-16 max-w-md px-4">
        <div className="rounded-3xl border border-gray-100 bg-white p-8 text-center">
          <h1 className="mb-2 text-xl font-semibold text-gray-900">
            This link isn&apos;t valid
          </h1>
          <p className="text-sm text-gray-500">
            The connect link may have been replaced with a newer one. Ask the
            group admin to send you a fresh link.
          </p>
        </div>
      </div>
    )
  }

  if (phase === 'done' && result) {
    return (
      <div className="mx-auto mt-16 max-w-md px-4">
        <div className="rounded-3xl border border-gray-100 bg-white p-8 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-green-100 text-2xl">
            ✓
          </div>
          <h1 className="mb-2 text-xl font-semibold text-gray-900">
            You&apos;re connected, {result.member_name}!
          </h1>
          {result.refresh_enabled ? (
            <p className="text-sm text-gray-500">
              Your workouts will now sync automatically. You shouldn&apos;t
              need to do this again for months. You can close this page.
            </p>
          ) : (
            <p className="text-sm text-amber-600">{result.warning}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Hi {memberName.split(' ')[0]} 👋
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Let&apos;s connect your Peloton account to the group leaderboard.
          Takes about a minute — no password needed, and you only share a
          sign-in key from your own browser.
        </p>
      </div>

      <ol className="space-y-4">
        {/* Step 1 */}
        <li className="rounded-2xl border border-gray-100 bg-white p-5">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-purple-500">
            Step 1
          </div>
          <p className="text-sm text-gray-700">
            On a computer, open{' '}
            <a
              href="https://members.onepeloton.com"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-purple-600 underline hover:text-purple-700"
            >
              members.onepeloton.com
            </a>{' '}
            in Chrome or Edge and sign in to your Peloton account.
          </p>
        </li>

        {/* Step 2 */}
        <li className="rounded-2xl border border-gray-100 bg-white p-5">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-purple-500">
            Step 2
          </div>
          <p className="text-sm text-gray-700">
            On that Peloton tab, press <kbd className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">F12</kbd>,
            click the <strong>Console</strong> tab, paste the code below, and
            press Enter. (If the browser asks, type{' '}
            <code className="rounded bg-gray-100 px-1 text-xs">allow pasting</code>{' '}
            first.) You should see &ldquo;Bundle copied.&rdquo;
          </p>
          <div className="relative mt-3">
            <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-gray-100 bg-gray-50 p-3 pr-20 text-[10px] font-mono text-gray-600">
              <code>{CONSOLE_SNIPPET}</code>
            </pre>
            <button
              type="button"
              onClick={handleCopySnippet}
              className="absolute right-2 top-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-600 shadow-sm hover:bg-gray-50"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </li>

        {/* Step 3 */}
        <li className="rounded-2xl border border-gray-100 bg-white p-5">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-purple-500">
            Step 3
          </div>
          <p className="mb-3 text-sm text-gray-700">
            Come back to this page and paste (Ctrl+V) into the box:
          </p>
          <textarea
            value={bundleJson}
            onChange={(e) => handlePaste(e.target.value)}
            placeholder="Paste here…"
            rows={4}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-mono outline-none focus:ring-2 focus:ring-purple-200"
          />
          {parseError && (
            <p className="mt-1 text-xs text-red-600">{parseError}</p>
          )}
          {parsedOk && (
            <p className="mt-1 text-xs text-green-600">
              Looks good — hit Connect.
            </p>
          )}
        </li>
      </ol>

      {submitError && (
        <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {submitError}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!parsedOk || submitting}
        className="mt-5 w-full rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 px-4 py-3 text-sm font-medium text-white shadow transition-shadow hover:shadow-md disabled:opacity-50"
      >
        {submitting ? 'Connecting…' : 'Connect my Peloton'}
      </button>

      <p className="mt-4 text-center text-xs text-gray-400">
        This stores a sign-in key so the leaderboard can read your workout
        history. It never sees your Peloton password, and you can revoke it
        anytime by changing your password.
      </p>
    </div>
  )
}
