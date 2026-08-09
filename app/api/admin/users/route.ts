import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { isAuthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Admin-only management of the sign-in allowlist (app_users).
//
// GET    → { users: [{ email, role, last_login_at, created_at }] }
// POST   → { email, role } — add to the allowlist
// DELETE → { email } — remove (revokes future sign-ins; the auth user is
//          also deleted so an existing session dies at next refresh)

const ROLES = ['admin', 'picker'] as const

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data, error } = await getSupabaseAdmin()
    .from('app_users')
    .select('email, role, last_login_at, created_at')
    .order('created_at', { ascending: true })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ users: data ?? [] })
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let body: { email?: unknown; role?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const email =
    typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const role = ROLES.includes(body.role as (typeof ROLES)[number])
    ? (body.role as (typeof ROLES)[number])
    : null
  if (!email.includes('@') || !role) {
    return NextResponse.json(
      { error: 'A valid email and a role (admin or picker) are required.' },
      { status: 400 }
    )
  }

  const { error } = await getSupabaseAdmin()
    .from('app_users')
    .upsert({ email, role }, { onConflict: 'email' })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, email, role })
}

export async function DELETE(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let body: { email?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const email =
    typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }

  const db = getSupabaseAdmin()
  const { data: row } = await db
    .from('app_users')
    .select('email, auth_user_id')
    .eq('email', email)
    .maybeSingle()
  if (!row) {
    return NextResponse.json({ error: 'No such user' }, { status: 404 })
  }

  const { error: delErr } = await db.from('app_users').delete().eq('email', email)
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 })
  }
  if (row.auth_user_id) {
    // Best-effort: kill the auth account so existing sessions lapse.
    await db.auth.admin.deleteUser(row.auth_user_id).catch(() => {})
  }
  return NextResponse.json({ ok: true })
}
