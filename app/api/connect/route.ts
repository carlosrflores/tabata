import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { authenticatePeloton } from '@/lib/peloton'

export const dynamic = 'force-dynamic'
// Edge runtime: authenticatePeloton calls Peloton /api/me, which is blocked
// from Vercel Lambda egress. Same as /api/admin/peloton-bootstrap.
export const runtime = 'edge'

// Self-serve member token bootstrap, gated by a per-member connect code
// instead of CRON_SECRET. Codes are minted from /admin and live in
// member_connect_codes (service-role-only RLS).
//
// GET  /api/connect?code=...  → { member_name } for the greeting, 404 if bad.
// POST /api/connect           → { code, access_token, refresh_token,
//                                 client_id, expires_at, source }
//   - Validates the code, validates the token against Peloton /api/me,
//   - Requires the token to belong to that member's peloton_user_id
//     (prevents pasting someone else's token into your link),
//   - Upserts the member's member_credentials row with the full bundle.

function decodeJwtExpIso(token: string): string | null {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const payload = JSON.parse(atob(parts[1]))
    if (typeof payload.exp !== 'number') return null
    return new Date(payload.exp * 1000).toISOString()
  } catch {
    return null
  }
}

async function lookupCode(code: string) {
  const db = getSupabaseAdmin()
  const { data } = await db
    .from('member_connect_codes')
    .select('id, member_id, members ( id, name, peloton_user_id )')
    .eq('code', code)
    .maybeSingle()
  if (!data?.members) return null
  // Supabase typing returns the joined row as an array or object depending
  // on relationship metadata; normalize.
  const member = Array.isArray(data.members) ? data.members[0] : data.members
  if (!member) return null
  return {
    codeRowId: data.id as string,
    member: member as { id: string; name: string; peloton_user_id: string | null },
  }
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code') ?? ''
  if (!code) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const hit = await lookupCode(code)
  if (!hit) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ member_name: hit.member.name })
}

interface ConnectBody {
  code?: unknown
  access_token?: unknown
  refresh_token?: unknown
  client_id?: unknown
  expires_at?: unknown
  source?: unknown
}

export async function POST(req: NextRequest) {
  let body: ConnectBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const code = typeof body.code === 'string' && body.code ? body.code : null
  if (!code) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const hit = await lookupCode(code)
  if (!hit) {
    // Generic 404 — don't reveal whether the code exists.
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const accessToken =
    typeof body.access_token === 'string' && body.access_token
      ? body.access_token
      : null
  if (!accessToken) {
    return NextResponse.json({ error: 'access_token is required' }, { status: 400 })
  }
  const refreshToken =
    typeof body.refresh_token === 'string' && body.refresh_token
      ? body.refresh_token
      : null
  const clientId =
    typeof body.client_id === 'string' && body.client_id ? body.client_id : null

  // Validate against Peloton.
  let pelotonUserId: string
  try {
    const session = await authenticatePeloton(accessToken)
    pelotonUserId = session.userId
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: `Peloton rejected the access token: ${message}` },
      { status: 400 }
    )
  }

  // The token must belong to the member this link was minted for.
  if (
    hit.member.peloton_user_id &&
    hit.member.peloton_user_id !== pelotonUserId
  ) {
    return NextResponse.json(
      {
        error:
          'This token belongs to a different Peloton account than this connect link. ' +
          'Make sure you are signed in to YOUR Peloton account, then try again.',
      },
      { status: 400 }
    )
  }

  const tokenExpiresAt =
    decodeJwtExpIso(accessToken) ??
    (typeof body.expires_at === 'number'
      ? new Date(body.expires_at * 1000).toISOString()
      : null)

  const db = getSupabaseAdmin()
  const credsPayload = {
    peloton_bearer_token: accessToken,
    peloton_refresh_token: refreshToken,
    peloton_token_expires_at: tokenExpiresAt,
    peloton_auth0_client_id: clientId,
    updated_at: new Date().toISOString(),
  }

  // member_credentials has no unique constraint on member_id; emulate upsert.
  const { data: existing } = await db
    .from('member_credentials')
    .select('id')
    .eq('member_id', hit.member.id)
    .maybeSingle()

  const writeErr = existing
    ? (
        await db
          .from('member_credentials')
          .update(credsPayload)
          .eq('member_id', hit.member.id)
      ).error
    : (
        await db
          .from('member_credentials')
          .insert({ member_id: hit.member.id, ...credsPayload })
      ).error

  if (writeErr) {
    return NextResponse.json(
      { error: `Failed to store credentials: ${writeErr.message}` },
      { status: 500 }
    )
  }

  await db
    .from('member_connect_codes')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', hit.codeRowId)

  const refreshEnabled = Boolean(refreshToken && clientId)
  return NextResponse.json({
    ok: true,
    member_name: hit.member.name,
    token_expires_at: tokenExpiresAt,
    refresh_enabled: refreshEnabled,
    warning: refreshEnabled
      ? null
      : 'Only the access token was captured — it will expire in ~48 hours. Re-run the capture making sure you are fully signed in.',
  })
}
