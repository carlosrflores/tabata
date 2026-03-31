import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Browser client - uses anon key, respects Row Level Security
// Safe to use in React components and client-side code
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Server client - uses service role key, bypasses RLS
// Only use in API routes and sync functions - NEVER expose to browser
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
})
