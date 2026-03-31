-- ============================================================
-- Tabata Tuesday - Supabase Schema
-- Run this entire file in your Supabase SQL editor
-- ============================================================

-- Members table: one row per person in your group
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  initials text not null,                    -- e.g. "SK" for Sarah K.
  peloton_username text not null unique,
  peloton_user_id text not null unique,      -- the long alphanumeric ID from Peloton
  is_owner boolean default false,            -- marks you as the admin
  active boolean default true,
  created_at timestamptz default now()
);

-- Encrypted credentials vault (Supabase Vault extension)
-- This keeps Peloton passwords out of the main database tables
create table if not exists member_credentials (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id) on delete cascade,
  peloton_password_encrypted text not null,  -- stored encrypted via Vault
  updated_at timestamptz default now()
);

-- Workouts table: one row per completed Peloton workout
create table if not exists workouts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id) on delete cascade,
  peloton_workout_id text not null unique,   -- prevents duplicate syncs
  workout_date timestamptz not null,
  fitness_discipline text not null,          -- cycling, strength, yoga, etc.
  title text,
  instructor_name text,
  duration_seconds integer,
  total_output_kj numeric,
  avg_watts numeric,
  avg_cadence numeric,
  avg_resistance numeric,
  avg_speed numeric,
  distance_miles numeric,
  calories numeric,
  leaderboard_rank integer,
  leaderboard_total integer,
  difficulty_rating numeric,
  is_personal_record boolean default false,
  raw_data jsonb,                             -- store full API response for future use
  created_at timestamptz default now()
);

-- Index for fast weekly leaderboard queries
create index if not exists workouts_member_date
  on workouts(member_id, workout_date desc);

-- Index for discipline filtering (cycling only for main board)
create index if not exists workouts_discipline
  on workouts(fitness_discipline, workout_date desc);

-- Sync log: track when syncs run and whether they succeeded
create table if not exists sync_log (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id),
  started_at timestamptz default now(),
  completed_at timestamptz,
  workouts_added integer default 0,
  status text default 'running',             -- running, success, error
  error_message text
);

-- ============================================================
-- Views: pre-computed queries used by the API
-- ============================================================

-- Weekly leaderboard view (rolling 7-day window from most recent Tuesday)
create or replace view weekly_leaderboard as
with week_bounds as (
  -- Find the most recent Tuesday (day 2 in postgres, 0=sunday)
  select
    date_trunc('week', now()) + interval '1 day' as week_start,
    date_trunc('week', now()) + interval '8 days' as week_end
),
member_weekly as (
  select
    w.member_id,
    m.name,
    m.initials,
    coalesce(sum(w.total_output_kj), 0) as total_output_kj,
    count(w.id) as workout_count,
    min(w.leaderboard_rank) as best_leaderboard_rank,
    max(w.leaderboard_total) as best_leaderboard_total
  from members m
  left join workouts w
    on w.member_id = m.id
    and w.workout_date >= (select week_start from week_bounds)
    and w.workout_date < (select week_end from week_bounds)
    and w.fitness_discipline = 'cycling'
  where m.active = true
  group by w.member_id, m.name, m.initials
)
select
  member_id,
  name,
  initials,
  total_output_kj,
  workout_count,
  best_leaderboard_rank,
  best_leaderboard_total,
  case
    when best_leaderboard_rank is not null and best_leaderboard_total > 0
    then round((1 - (best_leaderboard_rank::numeric / best_leaderboard_total)) * 100, 1)
    else null
  end as leaderboard_percentile,
  row_number() over (order by total_output_kj desc) as rank
from member_weekly
order by total_output_kj desc;

-- Personal records view: best output per duration per member
create or replace view personal_records as
select distinct on (member_id, duration_seconds)
  member_id,
  duration_seconds,
  duration_seconds / 60 as duration_minutes,
  title,
  instructor_name,
  workout_date,
  total_output_kj
from workouts
where fitness_discipline = 'cycling'
  and total_output_kj is not null
  and total_output_kj > 0
order by member_id, duration_seconds, total_output_kj desc;

-- ============================================================
-- Row Level Security: members can only read their own data
-- (Public read on leaderboard is intentional for the group)
-- ============================================================

alter table members enable row level security;
alter table workouts enable row level security;
alter table member_credentials enable row level security;

-- Service role (sync function) can do everything
-- Public/anon can read members and workouts (leaderboard is public within the group)
create policy "public can read members"
  on members for select using (true);

create policy "public can read workouts"
  on workouts for select using (true);

-- Credentials are service-role only (never exposed to frontend)
create policy "service role only on credentials"
  on member_credentials for all using (auth.role() = 'service_role');

-- ============================================================
-- Seed: insert yourself as the first member
-- Replace the values below with your actual details
-- ============================================================

-- insert into members (name, initials, peloton_username, peloton_user_id, is_owner)
-- values ('Your Name', 'YN', 'your_peloton_username', 'your_peloton_user_id', true);
