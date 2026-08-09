import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// POST /api/auth/request-link — send a magic link, allowlist-gated.
//
// Only emails present in app_users get a link. The auth user is created
// lazily here (email_confirm: true) so seeded allowlist rows work on
// first login without any dashboard step. Responses are identical for
// known and unknown emails — no membership oracle.

const GENERIC = {
  ok: true,
  message: 'If that address has access, a sign-in link is on its way.',
}

export async function POST(req: NextRequest) {
  let body: { email?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const email =
    typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Enter a valid email.' }, { status: 400 })
  }

  const db = getSupabaseAdmin()
  const { data: appUser } = await db
    .from('app_users')
    .select('email')
    .eq('email', email)
    .maybeSingle()
  if (!appUser) {
    return NextResponse.json(GENERIC)
  }

  // Ensure the auth user exists so shouldCreateUser: false can succeed.
  const { error: createErr } = await db.auth.admin.createUser({
    email,
    email_confirm: true,
  })
  if (createErr && !`${createErr.code ?? createErr.message}`.includes('email_exists')) {
    console.error('createUser failed:', createErr)
    return NextResponse.json(
      { error: 'Could not prepare your account. Try again.' },
      { status: 500 }
    )
  }

  // Plain anon client — OTP request needs no cookie session.
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  )
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
  const { error: otpErr } = await anon.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${baseUrl}/auth/callback`,
    },
  })
  if (otpErr) {
    // Most common cause: built-in mailer rate limit (a few emails/hour).
    console.error('signInWithOtp failed:', otpErr)
    return NextResponse.json(
      {
        error:
          'Could not send the link (the email service may be rate-limited). Wait a few minutes and try again.',
      },
      { status: 500 }
    )
  }

  return NextResponse.json(GENERIC)
}
