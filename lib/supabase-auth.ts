// Cookie-session Supabase clients for magic-link auth (@supabase/ssr).
// Distinct from lib/supabase.ts, whose anon/admin clients are session-less
// data clients. These carry the signed-in user's auth session via cookies.

import { createBrowserClient, createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Browser client — used by /login and any client component that needs the
// auth session. Safe to call repeatedly (ssr package caches internally).
export function getSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Server client — for server components and route handlers. Reads the
// session from request cookies; cookie writes are best-effort (server
// components can't set cookies — middleware handles refresh persistence).
export function getSupabaseServer() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component — safe to ignore, the
            // middleware refreshes sessions.
          }
        },
      },
    }
  )
}
