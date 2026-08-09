import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /auth/callback — lands here from the magic-link email.
// Supports both the PKCE `code` exchange and the `token_hash` variant
// (which one arrives depends on the Supabase email template in use).
// On success: stamp app_users, then send admins to /admin and pickers
// to /tabata.

export async function GET(req: NextRequest) {
  const url = req.nextUrl
  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const supabase = getSupabaseServer()

  let authError: string | null = null
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    authError = error?.message ?? null
  } else if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({
      type: 'email',
      token_hash: tokenHash,
    })
    authError = error?.message ?? null
  } else {
    authError = url.searchParams.get('error_description') ?? 'Missing code'
  }

  if (authError) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(authError)}`, url.origin)
    )
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const email = user?.email?.toLowerCase()

  const db = getSupabaseAdmin()
  const { data: appUser } = email
    ? await db.from('app_users').select('email, role').eq('email', email).maybeSingle()
    : { data: null }

  if (!appUser) {
    // Valid auth session but not allowlisted (e.g. removed after invite).
    await supabase.auth.signOut()
    return NextResponse.redirect(
      new URL('/login?error=This%20account%20does%20not%20have%20access.', url.origin)
    )
  }

  await db
    .from('app_users')
    .update({
      auth_user_id: user!.id,
      last_login_at: new Date().toISOString(),
    })
    .eq('email', appUser.email)

  const dest = appUser.role === 'picker' ? '/tabata' : '/admin'
  return NextResponse.redirect(new URL(dest, url.origin))
}
