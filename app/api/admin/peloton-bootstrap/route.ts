import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { authenticatePeloton } from '@/lib/peloton'

export const dynamic = 'force-dynamic'
// Edge runtime: authenticatePeloton calls Peloton /api/me, which is blocked
// from Vercel Lambda egress. See app/api/debug/route.ts for the same reason.
export const runtime = 'edge'

// POST /api/admin/peloton-bootstrap
//
// Accepts the full Auth0 token bundle in one shot:
//   { access_token, refresh_token, client_id, expires_at, source }
//
// Called by:
//   - The /admin/peloton-bootstrap web form (paste-from-DevTools path).
//   - The iOS Shortcut from docs/ios-shortcut-bootstrap.md.
//   - curl, eventually.
//
// Behavior:
//   - Validates access_token by calling Peloton /api/me. 401 → 400 with a
//     clear error.
//   - Decodes the JWT `exp` claim. The JWT claim is the source of truth;
//     any expires_at supplied in the body is fallback only.
//   - Refuses to overwrite if the bootstrap token belongs to a different
//     Peloton user than the existing owner row (prevents accidental
//     account swap).
//   - Updates (or inserts) the owner's member_credentials row.
//   - Returns a `warning` field when the refresh bundle is incomplete
//     (refresh_token or client_id missing) so the UI can flag that the
//     refresh-token flow will NOT engage.

interface BootstrapBody {
  access_token?: unknown
  refresh_token?: unknown
  client_id?: unknown
  expires_at?: unknown
  source?: unknown
}

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

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: BootstrapBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
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
  const source =
    body.source === 'localStorage' || body.source === 'fetch-intercept'
      ? body.source
      : null

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

  // Prefer JWT exp (source of truth) over the body-supplied expires_at.
  const tokenExpiresAt =
    decodeJwtExpIso(accessToken) ??
    (typeof body.expires_at === 'number'
      ? new Date(body.expires_at * 1000).toISOString()
      : null)

  const db = getSupabaseAdmin()

  const { data: owner, error: ownerErr } = await db
    .from('members')
    .select('id, peloton_user_id, name')
    .eq('is_owner', true)
    .single()
  if (ownerErr || !owner) {
    return NextResponse.json(
      { error: 'No owner member exists. Add yourself via /admin first.' },
      { status: 400 }
    )
  }

  // Refuse to overwrite if the token's user doesn't match the owner.
  if (owner.peloton_user_id && owner.peloton_user_id !== pelotonUserId) {
    return NextResponse.json(
      {
        error: `Token belongs to Peloton user ${pelotonUserId} but the owner row is bound to ${owner.peloton_user_id}. Refusing to overwrite.`,
      },
      { status: 400 }
    )
  }

  // member_credentials has no unique constraint on member_id, so emulate
  // upsert: try update, fall through to insert if the owner has no row yet.
  const credsPayload = {
    peloton_bearer_token: accessToken,
    peloton_refresh_token: refreshToken,
    peloton_token_expires_at: tokenExpiresAt,
    peloton_auth0_client_id: clientId,
    updated_at: new Date().toISOString(),
  }

  const { data: existing } = await db
    .from('member_credentials')
    .select('id')
    .eq('member_id', owner.id)
    .maybeSingle()

  if (existing) {
    const { error: updateErr } = await db
      .from('member_credentials')
      .update(credsPayload)
      .eq('member_id', owner.id)
    if (updateErr) {
      return NextResponse.json(
        { error: `Failed to update credentials: ${updateErr.message}` },
        { status: 500 }
      )
    }
  } else {
    const { error: insertErr } = await db
      .from('member_credentials')
      .insert({ member_id: owner.id, ...credsPayload })
    if (insertErr) {
      return NextResponse.json(
        { error: `Failed to insert credentials: ${insertErr.message}` },
        { status: 500 }
      )
    }
  }

  const refreshEnabled = Boolean(refreshToken && clientId)
  let warning: string | null = null
  if (!refreshEnabled) {
    if (source === 'fetch-intercept') {
      warning =
        'Stored access token only (Shortcut fetch-intercept fallback). Refresh-token flow will NOT engage; re-bootstrap before the next expiry.'
    } else {
      warning =
        'refresh_token and/or client_id missing. Refresh-token flow is dormant — you will need to re-bootstrap when the access token expires.'
    }
  }

  return NextResponse.json({
    ok: true,
    owner_name: owner.name,
    peloton_user_id: pelotonUserId,
    token_expires_at: tokenExpiresAt,
    refresh_enabled: refreshEnabled,
    source: source ?? 'web',
    warning,
  })
}
