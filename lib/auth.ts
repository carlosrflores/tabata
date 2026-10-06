// Role-based authorization for admin surfaces.
//
// Two independent ways in:
//   1. Machine callers (GitHub Actions, curl, the iOS
//      Shortcut) present `Authorization: Bearer <CRON_SECRET>` — unchanged.
//   2. Humans sign in via magic link; their session cookie maps to a row
//      in app_users, which carries the role.

import type { NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getSupabaseServer } from '@/lib/supabase-auth'

export type AppRole = 'admin' | 'picker'

export interface AppUser {
  email: string
  role: AppRole
  member_id: string | null
}

// The signed-in user's app_users row, or null when signed out or not
// allowlisted. Server-side only (reads session cookies).
export async function getAppUser(): Promise<AppUser | null> {
  const supabase = getSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const email = user?.email?.toLowerCase()
  if (!email) return null

  const { data } = await getSupabaseAdmin()
    .from('app_users')
    .select('email, role, member_id')
    .eq('email', email)
    .maybeSingle()
  if (!data) return null
  return data as AppUser
}

// True when the request carries CRON_SECRET or a session whose role is in
// `roles`. Route handlers call this in place of the old header-only check.
export async function isAuthorized(
  req: NextRequest,
  roles: AppRole[] = ['admin']
): Promise<boolean> {
  const authHeader = req.headers.get('authorization')
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) return true

  const user = await getAppUser()
  return user != null && roles.includes(user.role)
}
