import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = getSupabaseServer()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login', req.nextUrl.origin), 303)
}
