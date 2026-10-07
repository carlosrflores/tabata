import { NextRequest, NextResponse } from 'next/server'
import { isAuthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// POST /api/admin/sync — queues the Peloton sync on GitHub Actions.
// Body: { memberId?: string } — omit to sync every active member.
//
// Syncs no longer run on Vercel: Peloton's WAF kills them partway, and
// each attempt still rotated the Peloton refresh token, racing the
// GitHub Actions cron. This route only dispatches the workflow; results
// land in sync_runs / /admin/health a minute or two later.
//
// Needs GITHUB_DISPATCH_TOKEN: a fine-grained PAT scoped to this repo
// with "Actions: Read and write".
const REPO = process.env.GITHUB_REPO ?? 'carlosrflores/tabata'
const WORKFLOW = 'peloton-sync.yml'

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = process.env.GITHUB_DISPATCH_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'GITHUB_DISPATCH_TOKEN is not configured' }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))
  const memberId = typeof body.memberId === 'string' ? body.memberId : ''
  if (memberId && !/^[0-9a-f-]{36}$/i.test(memberId)) {
    return NextResponse.json({ error: 'Invalid memberId' }, { status: 400 })
  }

  const res = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'tabata-admin',
      },
      body: JSON.stringify({ ref: 'main', inputs: { trigger: 'manual', member_id: memberId } }),
      cache: 'no-store',
    }
  )

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 200)
    return NextResponse.json({ error: `GitHub dispatch failed (${res.status}): ${detail}` }, { status: 502 })
  }
  return NextResponse.json({ queued: true }, { status: 202 })
}
