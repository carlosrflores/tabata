-- ============================================================
-- Tabata Tuesday — Additional SQL
-- Run this in Supabase SQL Editor AFTER the main schema.sql
-- ============================================================

-- Streak function: counts how many consecutive Tuesdays 
-- each member has had at least one cycling workout
create or replace function get_member_streaks()
returns table(member_id uuid, streak_weeks int)
language plpgsql
as $$
declare
  check_date date;
  weeks_back int := 0;
begin
  -- Build a temp table of Tuesday dates going back 12 weeks
  create temp table if not exists tuesday_dates (tue date) on commit drop;
  truncate tuesday_dates;

  for i in 0..11 loop
    -- Find the most recent Tuesday (weekday = 2 in PostgreSQL, 0=Sunday)
    insert into tuesday_dates
    select (date_trunc('week', now()) + interval '1 day' - (i * interval '7 days'))::date;
  end loop;

  -- For each member, walk backwards through Tuesdays counting consecutive active weeks
  return query
  with member_active_tuesdays as (
    select
      w.member_id,
      date_trunc('week', w.workout_date + interval '6 days')::date as week_tuesday
    from workouts w
    where w.fitness_discipline = 'cycling'
      and w.workout_date >= now() - interval '12 weeks'
    group by w.member_id, week_tuesday
  ),
  all_members as (
    select id as member_id from members where active = true
  ),
  streaks as (
    select
      am.member_id,
      count(mat.week_tuesday) as streak_weeks
    from all_members am
    cross join tuesday_dates td
    left join member_active_tuesdays mat
      on mat.member_id = am.member_id
      and mat.week_tuesday = td.tue
    where td.tue <= (select max(tue) from tuesday_dates)
    group by am.member_id
  )
  select s.member_id, s.streak_weeks::int
  from streaks s;
end;
$$;

-- ============================================================
-- Update the weekly_leaderboard view to support is_you flag
-- The app passes a member_id query param and marks one row
-- is_you = true on the API side (no SQL change needed)
-- ============================================================

-- Helper view: group stats for the current week
create or replace view current_week_stats as
with week_bounds as (
  select
    (date_trunc('week', now()) + interval '1 day')::date as week_start,
    (date_trunc('week', now()) + interval '8 days')::date as week_end
)
select
  coalesce(sum(w.total_output_kj), 0)::int as group_total_output_kj,
  count(distinct w.member_id) as active_members,
  (select count(*) from members where active = true) as total_members,
  (
    select m2.name
    from workouts w2
    join members m2 on m2.id = w2.member_id
    where w2.workout_date >= (select week_start from week_bounds)
      and w2.workout_date < (select week_end from week_bounds)
      and w2.fitness_discipline = 'cycling'
    group by m2.name
    order by sum(w2.total_output_kj) desc
    limit 1
  ) as top_performer_name,
  (
    select sum(w3.total_output_kj)
    from workouts w3
    join members m3 on m3.id = w3.member_id
    where w3.workout_date >= (select week_start from week_bounds)
      and w3.workout_date < (select week_end from week_bounds)
      and w3.fitness_discipline = 'cycling'
    group by m3.member_id
    order by sum(w3.total_output_kj) desc
    limit 1
  )::int as top_performer_kj,
  (select week_start from week_bounds) as week_start
from workouts w
join week_bounds wb on true
where w.workout_date >= wb.week_start
  and w.workout_date < wb.week_end
  and w.fitness_discipline = 'cycling';

-- ============================================================
-- Useful admin queries (reference — not run automatically)
-- ============================================================

-- See all members and their last sync
-- select m.name, m.peloton_username, max(s.completed_at) as last_synced, 
--        sum(case when s.status = 'error' then 1 else 0 end) as error_count
-- from members m
-- left join sync_log s on s.member_id = m.id
-- group by m.name, m.peloton_username
-- order by last_synced desc;

-- See how many workouts per member
-- select m.name, count(w.id) as workout_count, 
--        max(w.workout_date) as latest_workout
-- from members m
-- left join workouts w on w.member_id = m.id
-- group by m.name
-- order by workout_count desc;
