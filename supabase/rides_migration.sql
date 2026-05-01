-- ============================================================
-- Tabata Tuesday — Rides feature migration
-- Apply in Supabase SQL editor AFTER schema.sql and functions.sql
-- ============================================================
--
-- Adds:
--   1. `rides` table — cached metadata per Peloton class
--   2. `ride_id` column on `workouts` (backfilled from raw_data)
--   3. `ride_comparison` view — best attempt per member per ride
--   4. `ride_popularity` view — rides sorted by group popularity
--
-- Idempotent: safe to run multiple times.
-- ============================================================

-- 1. Rides table -----------------------------------------------------------
-- Cached metadata per Peloton class. Populated by the sync job.
-- Instructor info stays denormalized on `workouts.instructor_name` to match
-- the existing pattern; we just cache the class-level fields here.

create table if not exists rides (
  id                       text primary key,        -- Peloton ride_id
  title                    text,
  description              text,
  instructor_name          text,
  instructor_image_url     text,
  duration_seconds         integer,
  fitness_discipline       text,
  difficulty_estimate      numeric(4,2),            -- crowdsourced 1–10
  overall_rating_avg       numeric(4,2),
  total_workouts           integer,                 -- popularity signal
  total_ratings            integer,
  image_url                text,                    -- class thumbnail
  original_air_time        timestamptz,
  has_pedaling_metrics     boolean default false,
  is_explicit              boolean default false,
  raw_data                 jsonb,                   -- full /api/ride/{id} response
  created_at               timestamptz default now(),
  updated_at               timestamptz default now()
);

create index if not exists rides_fitness_discipline_idx
  on rides(fitness_discipline);

create index if not exists rides_duration_idx
  on rides(duration_seconds);

-- Public read on rides — matches the workouts/members RLS pattern
alter table rides enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'rides' and policyname = 'public can read rides'
  ) then
    create policy "public can read rides" on rides for select using (true);
  end if;
end $$;

-- 2. ride_id column on workouts -------------------------------------------
-- Add the column nullable, then backfill from existing raw_data.
-- The sync job will set it directly on new inserts going forward.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'workouts' and column_name = 'ride_id'
  ) then
    alter table workouts add column ride_id text references rides(id) on delete set null;
  end if;
end $$;

-- Backfill existing rows from raw_data.
-- The Peloton API returns the ride object at raw_data->'ride'.
-- This update is idempotent — only fills nulls.
update workouts
set ride_id = raw_data->'ride'->>'id'
where ride_id is null
  and raw_data->'ride'->>'id' is not null;

create index if not exists workouts_ride_id_idx on workouts(ride_id);
create index if not exists workouts_member_ride_idx on workouts(member_id, ride_id);

-- Helps the "best attempt per (member, ride)" sort in ride_comparison.
create index if not exists workouts_ride_member_output_idx
  on workouts(ride_id, member_id, total_output_kj desc nulls last);

-- 3. ride_comparison view -------------------------------------------------
-- One row per (ride, member) — that member's BEST attempt at the ride.
-- This is the primary data source for /rides/[ride_id].

create or replace view ride_comparison as
with ranked_attempts as (
  select
    w.*,
    row_number() over (
      partition by w.ride_id, w.member_id
      order by w.total_output_kj desc nulls last, w.workout_date desc
    ) as attempt_rank,
    count(*) over (partition by w.ride_id, w.member_id) as total_attempts
  from workouts w
  where w.ride_id is not null
)
select
  ra.ride_id,
  ra.member_id,
  m.name                          as member_name,
  m.initials                      as member_initials,
  m.active                        as member_active,
  ra.id                           as workout_id,
  ra.workout_date,
  ra.total_output_kj,
  ra.avg_watts,
  ra.avg_cadence,
  ra.avg_resistance,
  ra.avg_speed,
  ra.distance_miles,
  ra.calories,
  ra.leaderboard_rank,
  ra.leaderboard_total,
  case
    when ra.leaderboard_rank is not null and ra.leaderboard_total > 0
    then round(
      (1 - (ra.leaderboard_rank::numeric / ra.leaderboard_total::numeric)) * 100,
      1
    )
    else null
  end                             as leaderboard_percentile,
  ra.is_personal_record,
  ra.total_attempts
from ranked_attempts ra
join members m on m.id = ra.member_id
where ra.attempt_rank = 1
  and m.active = true;

-- 4. ride_popularity view -------------------------------------------------
-- Rides anyone in the active group has taken, ranked by group popularity.

create or replace view ride_popularity as
select
  r.id                            as ride_id,
  r.title,
  r.image_url,
  r.duration_seconds,
  r.fitness_discipline,
  r.original_air_time,
  r.instructor_name,
  r.instructor_image_url,
  count(distinct w.member_id)     as group_member_count,
  count(w.id)                     as group_attempt_count,
  max(w.workout_date)             as most_recent_attempt,
  max(w.total_output_kj)          as group_best_output_kj
from rides r
join workouts w on w.ride_id = r.id
join members m on m.id = w.member_id and m.active = true
group by r.id;

-- ============================================================
-- Done.
-- ============================================================
-- Next step: extend the sync job to upsert into `rides` and set
-- workouts.ride_id directly on insert. Existing rows are already
-- backfilled by this migration.
