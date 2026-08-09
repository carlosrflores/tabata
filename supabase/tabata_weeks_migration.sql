-- ============================================================
-- Tabata Tuesday weekly pick — the class Stephanie schedules
-- Run this entire file in your Supabase SQL editor. Idempotent.
--
-- One row per Tabata week (Tuesday-keyed, matching the site's
-- Tue→Tue week convention). Populated from the scheduled-class
-- share link via POST /api/admin/tabata-week; read by the
-- public /tabata page.
-- ============================================================

create table if not exists tabata_weeks (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,           -- the Tuesday this pick belongs to
  ride_id text not null references rides(id),
  scheduled_start timestamptz,               -- Stephanie's scheduled session time
  host_peloton_user_id text,                 -- decoded from the share link
  source_url text,                           -- the pasted link, for auditing
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Data API grants (new public tables no longer auto-receive role grants).
grant select on public.tabata_weeks to anon, authenticated;
grant select, insert, update, delete on public.tabata_weeks to service_role;

-- Public read — matches the members/workouts/rides RLS posture.
alter table tabata_weeks enable row level security;

do $$ begin
  create policy "Public read access on tabata_weeks"
    on tabata_weeks for select
    using (true);
exception when duplicate_object then null; end $$;
