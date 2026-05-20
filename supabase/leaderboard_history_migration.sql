-- ============================================================
-- Tabata Tuesday — Weekly leaderboard history
-- Apply in the Supabase SQL editor AFTER schema.sql, functions.sql,
-- rides_migration.sql, and member_image_migration.sql.
-- ============================================================
--
-- Adds leaderboard_for_week(p_week_offset), a parameterized version of the
-- weekly_leaderboard view so the UI can page back through prior weeks.
--
--   p_week_offset = 0  → current week (identical bounds to weekly_leaderboard)
--   p_week_offset = 1  → last week, 2 → two weeks ago, etc.
--
-- The week is Tuesday → Tuesday, matching weekly_leaderboard and
-- current_week_stats: date_trunc('week', now()) is Monday, +1 day = Tuesday.
-- Includes members.image_url so the podium can show avatars.
--
-- Idempotent: create or replace.
-- ============================================================

create or replace function leaderboard_for_week(p_week_offset int default 0)
returns table (
  member_id uuid,
  name text,
  initials text,
  image_url text,
  total_output_kj numeric,
  workout_count bigint,
  best_leaderboard_rank int,
  best_leaderboard_total int,
  leaderboard_percentile numeric,
  week_start date
)
language sql
stable
as $$
  with bounds as (
    select
      (date_trunc('week', now()) + interval '1 day'
        - (p_week_offset * interval '7 days'))::date as week_start,
      (date_trunc('week', now()) + interval '8 days'
        - (p_week_offset * interval '7 days'))::date as week_end
  ),
  member_weekly as (
    select
      m.id          as member_id,
      m.name,
      m.initials,
      m.image_url,
      coalesce(sum(w.total_output_kj), 0) as total_output_kj,
      count(w.id)                         as workout_count,
      min(w.leaderboard_rank)             as best_leaderboard_rank,
      max(w.leaderboard_total)            as best_leaderboard_total
    from members m
    left join workouts w
      on w.member_id = m.id
      and w.workout_date >= (select week_start from bounds)
      and w.workout_date <  (select week_end from bounds)
      and w.fitness_discipline = 'cycling'
    where m.active = true
    group by m.id, m.name, m.initials, m.image_url
  )
  select
    mw.member_id,
    mw.name,
    mw.initials,
    mw.image_url,
    mw.total_output_kj,
    mw.workout_count,
    mw.best_leaderboard_rank,
    mw.best_leaderboard_total,
    case
      when mw.best_leaderboard_rank is not null and mw.best_leaderboard_total > 0
      then round((1 - (mw.best_leaderboard_rank::numeric / mw.best_leaderboard_total)) * 100, 1)
      else null
    end as leaderboard_percentile,
    (select week_start from bounds) as week_start
  from member_weekly mw
  order by mw.total_output_kj desc;
$$;

-- Data API grant so the anon-key client (home page) can call it.
grant execute on function leaderboard_for_week(int) to anon, authenticated, service_role;
