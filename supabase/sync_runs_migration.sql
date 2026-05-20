-- ============================================================
-- Tabata Tuesday — sync_runs observability migration
-- Apply in Supabase SQL editor AFTER schema.sql.
-- ============================================================
--
-- Adds a `sync_runs` table that captures one row per invocation
-- of syncAllMembers (cron, manual, or backfill). Replaces the
-- per-member `sync_log` rows as the primary signal for
-- "is the sync healthy right now?".
--
-- Idempotent: safe to run multiple times.
-- ============================================================

create table if not exists sync_runs (
  id                  uuid primary key default gen_random_uuid(),
  started_at          timestamptz not null default now(),
  finished_at         timestamptz,
  trigger             text not null,                        -- 'cron' | 'manual' | 'backfill'
  status              text not null,                        -- 'running' | 'success' | 'partial' | 'failed'
  members_processed   int default 0,
  members_failed      int default 0,
  workouts_added      int default 0,
  rides_added         int default 0,                        -- reserved; not yet populated
  last_error          text,                                 -- truncated to ~2KB by the writer
  token_expires_at    timestamptz,                          -- decoded from owner JWT at run start
  duration_ms         int generated always as
    ((extract(epoch from (finished_at - started_at)) * 1000)::int) stored
);

-- Recent-runs query on /admin/health.
create index if not exists sync_runs_started_at_idx
  on sync_runs (started_at desc);

-- Service-role only. /admin/health reads through an API route
-- gated by CRON_SECRET — same posture as member_credentials.
alter table sync_runs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'sync_runs' and policyname = 'service role only on sync_runs'
  ) then
    create policy "service role only on sync_runs"
      on sync_runs for all using (auth.role() = 'service_role');
  end if;
end $$;

-- ============================================================
-- Done.
-- ============================================================
-- Note: the existing `sync_log` table (per-member rows written
-- by syncMember) is left in place. sync_runs is the bulk-run
-- equivalent; the two coexist and serve different purposes.
