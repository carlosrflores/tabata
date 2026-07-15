import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Admin-only management of per-member connect codes.
//
// GET  → { codes: [{ member_id, code, created_at, last_used_at }] }
// POST → { member_id } — mint a code for the member (or rotate the
//        existing one), returns { code, url }.
//
// Gated by CRON_SECRET like the rest of /api/admin.

function authorized(req: NextRequest): boolean {
  return req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
}

function generateCode(): string {
  // 24 chars of URL-safe base62 from Web Crypto (~143 bits of entropy).
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

function connectUrl(code: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? ''
  return `${base.replace(/\/$/, '')}/connect/${code}`
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const db = getSupabaseAdmin()
  const { data, error } = await db
    .from('member_connect_codes')
    .select('member_id, code, created_at, rotated_at, last_used_at')
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({
    codes: (data ?? []).map((row) => ({ ...row, url: connectUrl(row.code) })),
  })
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { member_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const memberId =
    typeof body.member_id === 'string' && body.member_id ? body.member_id : null
  if (!memberId) {
    return NextResponse.json({ error: 'member_id is required' }, { status: 400 })
  }

  const db = getSupabaseAdmin()
  const { data: member, error: memberErr } = await db
    .from('members')
    .select('id, name')
    .eq('id', memberId)
    .single()
  if (memberErr || !member) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  }

  const code = generateCode()
  const { data: existing } = await db
    .from('member_connect_codes')
    .select('id')
    .eq('member_id', memberId)
    .maybeSingle()

  const writeErr = existing
    ? (
        await db
          .from('member_connect_codes')
          .update({ code, rotated_at: new Date().toISOString() })
          .eq('member_id', memberId)
      ).error
    : (
        await db
          .from('member_connect_codes')
          .insert({ member_id: memberId, code })
      ).error

  if (writeErr) {
    return NextResponse.json(
      { error: `Failed to save code: ${writeErr.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    member_name: member.name,
    code,
    url: connectUrl(code),
    rotated: Boolean(existing),
  })
}
