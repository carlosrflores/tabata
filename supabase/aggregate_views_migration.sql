-- ============================================================
-- Tabata Tuesday — Aggregate views to avoid the 1000-row Data API cap
-- Apply in the Supabase SQL editor. Idempotent (create or replace).
-- ============================================================
--
-- Two read paths previously fetched raw rows and aggregated in JS, which
-- silently caps at PostgREST's default 1000-row limit. These views push the
-- aggregation into Postgres so each returns one row per member.
-- ============================================================

-- All-time cycling totals per member (member page stat cards).
create or replace view member_cycling_totals as
select
  member_id,
  count(*)                              as total_workouts,
  coalesce(sum(total_output_kj), 0)     as total_output_kj
from workouts
where fitness_discipline = 'cycling'
group by member_id;

-- Most recent completed (non-running) sync per member (admin "synced" label).
create or replace view member_last_sync as
select distinct on (member_id)
  member_id,
  completed_at,
  status
from sync_log
where status <> 'running'
  and completed_at is not null
order by member_id, completed_at desc;

-- These views are read only by the service-role API routes.
grant select on member_cycling_totals to service_role;
grant select on member_last_sync     to service_role;
