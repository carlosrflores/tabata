'use client'

// Inline weekly-pick setter, shown on /tabata only to signed-in admins
// and pickers (the server component decides). Posting refreshes the page
// so the new class appears immediately.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Spinner from '../components/Spinner'

export default function SetWeekBox({ hasCurrent }: { hasCurrent: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(!hasCurrent)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/admin/tabata-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setMsg({
        ok: true,
        text: `Set: ${data.ride?.title ?? 'class'} (week of ${data.week_start})`,
      })
      setUrl('')
      router.refresh()
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed' })
    }
    setBusy(false)
  }

  if (!open) {
    return (
      <div className="mb-4 text-right">
        <button
          onClick={() => setOpen(true)}
          className="link-subtle text-xs"
        >
          change this week&apos;s class
        </button>
      </div>
    )
  }

  return (
    <div className="mb-4 rounded-2xl border border-purple-100 bg-purple-50/50 p-4">
      <div className="mb-2 text-xs font-medium text-purple-700">
        Set {hasCurrent ? 'a different' : 'this week&apos;s'} class
      </div>
      {msg && (
        <div
          className={
            'mb-2 rounded-lg border px-3 py-2 text-xs ' +
            (msg.ok
              ? 'border-green-100 bg-green-50 text-green-700'
              : 'border-red-100 bg-red-50 text-red-700')
          }
        >
          {msg.text}
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste the scheduled-class share link…"
          className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"
        />
        <button
          type="submit"
          disabled={busy || !url.trim()}
          className="press inline-flex flex-shrink-0 items-center gap-2 rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-600 disabled:opacity-50"
        >
          {busy && <Spinner />}
          {busy ? 'Saving…' : 'Set'}
        </button>
      </form>
    </div>
  )
}
