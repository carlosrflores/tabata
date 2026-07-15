-- ============================================================
-- Member connect codes — per-member self-serve token bootstrap
-- Run this entire file in your Supabase SQL editor. Idempotent.
--
-- Each member gets one high-entropy code. The public page
-- /connect/<code> lets that member store their own Peloton
-- token bundle without knowing CRON_SECRET. Codes are minted
-- and rotated from /admin.
--
-- SECURITY: this table must stay service-role only. Codes gate
-- credential writes; the public `members` RLS policy must never
-- apply here.
-- ============================================================

create table if not exists member_connect_codes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null unique references members(id) on delete cascade,
  code text not null unique,
  created_at timestamptz default now(),
  rotated_at timestamptz,
  last_used_at timestamptz
);

alter table member_connect_codes enable row level security;

do $$ begin
  create policy "service role only on member_connect_codes"
    on member_connect_codes for all
    using (auth.role() = 'service_role');
exception when duplicate_object then null; end $$;
