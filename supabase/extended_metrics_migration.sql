-- ============================================================
-- Tabata Tuesday — Extended Peloton metrics migration
-- Apply in Supabase SQL editor AFTER every earlier migration.
-- ============================================================
--
-- Adds typed columns for Peloton fields that already live in
-- `raw_data` but weren't surfaced for querying, plus a handful
-- of max/HR metrics from the performance_graph response (those
-- are populated going forward by the sync — perf_graph is not
-- persisted, so they can't be backfilled from existing rows).
--
-- Idempotent: safe to re-run.
-- ============================================================

-- 1. Workouts: context + authored metrics ---------------------------------

alter table workouts
  add column if not exists end_time                    timestamptz,
  add column if not exists platform                    text,
  add column if not exists device_type                 text,
  add column if not exists timezone                    text,
  add column if not exists workout_type                text,
  add column if not exists is_outdoor                  boolean,
  add column if not exists has_paused                  boolean,
  -- FTP captured on the workout (0 means "not set") — stored as null when 0.
  add column if not exists ftp_watts                   integer,
  add column if not exists ftp_source                  text,
  -- Peloton's "Strive Score" (field name: average_effort_score). Null unless
  -- a HR monitor was paired, so expect lots of nulls today.
  add column if not exists strive_score                numeric,
  -- Null when no HR monitor; otherwise an object like
  -- {heart_rate_z1_duration: N, ..._z5_duration: N}.
  add column if not exists heart_rate_zone_durations   jsonb,
  -- From /performance_graph. Populated by the sync going forward only
  -- (perf_graph responses aren't persisted, so no backfill is possible).
  add column if not exists avg_heart_rate              numeric,
  add column if not exists max_heart_rate              numeric,
  add column if not exists max_watts                   numeric,
  add column if not exists max_cadence                 numeric,
  add column if not exists max_resistance              numeric,
  add column if not exists max_speed                   numeric,
  -- User's self-reported effort (ratings.perceived_effort_rating); usually null.
  add column if not exists perceived_effort_rating     integer,
  -- Full achievement_templates array as returned (badges earned, streak flags).
  add column if not exists achievements                jsonb;

-- Backfill from raw_data for everything that lives in the workout summary.
-- Only touches rows where the target column is currently null, so re-running
-- after new syncs is safe.

update workouts set
  end_time = to_timestamp((raw_data->>'end_time')::bigint)
where end_time is null
  and raw_data ? 'end_time'
  and (raw_data->>'end_time') ~ '^[0-9]+$';

update workouts set platform    = raw_data->>'platform'    where platform    is null and raw_data ? 'platform';
update workouts set device_type = raw_data->>'device_type' where device_type is null and raw_data ? 'device_type';
update workouts set timezone    = raw_data->>'timezone'    where timezone    is null and raw_data ? 'timezone';
update workouts set workout_type = raw_data->>'workout_type' where workout_type is null and raw_data ? 'workout_type';

update workouts set is_outdoor = (raw_data->>'is_outdoor')::boolean
  where is_outdoor is null
    and (raw_data->>'is_outdoor') in ('true','false');

update workouts set has_paused = (raw_data->>'has_paused')::boolean
  where has_paused is null
    and (raw_data->>'has_paused') in ('true','false');

-- FTP: freestyle rows carry "0" which isn't a real FTP; store null for those.
update workouts set
  ftp_watts  = nullif((raw_data->'ftp_info'->>'ftp')::integer, 0),
  ftp_source = raw_data->'ftp_info'->>'ftp_source'
where (ftp_watts is null or ftp_source is null)
  and (raw_data->'ftp_info'->>'ftp') ~ '^-?[0-9]+$';

update workouts set strive_score = (raw_data->>'average_effort_score')::numeric
  where strive_score is null
    and (raw_data->>'average_effort_score') ~ '^-?[0-9]+(\.[0-9]+)?$';

-- Heart rate zones. The key is often present but the value is JSON null, so
-- store only when it's an actual object.
update workouts set heart_rate_zone_durations = raw_data->'total_heart_rate_zone_durations'
  where heart_rate_zone_durations is null
    and jsonb_typeof(raw_data->'total_heart_rate_zone_durations') = 'object';

update workouts set perceived_effort_rating = (raw_data->'ratings'->>'perceived_effort_rating')::integer
  where perceived_effort_rating is null
    and (raw_data->'ratings'->>'perceived_effort_rating') ~ '^[0-9]+$';

update workouts set achievements = raw_data->'achievement_templates'
  where achievements is null
    and jsonb_typeof(raw_data->'achievement_templates') = 'array';

-- 2. Rides: class classification + structural metadata --------------------

alter table rides
  -- The big one: lets us tell Tabata rides from Climb/Low-Impact/etc.
  add column if not exists class_type_ids               text[],
  add column if not exists instructor_id                text,
  add column if not exists series_id                    text,
  add column if not exists ride_type_id                 text,
  -- Studio the class was filmed in (e.g. psny-studio-1, uk, psl-studio-3).
  add column if not exists studio_location              text,
  add column if not exists origin_locale                text,
  add column if not exists language                     text,
  -- The scheduled slot length (includes intro/outro). `duration_seconds`
  -- already stores the actual pedaling-era runtime; both are useful.
  add column if not exists length_seconds               integer,
  add column if not exists pedaling_duration_seconds    integer,
  add column if not exists pedaling_start_offset        integer,
  add column if not exists pedaling_end_offset          integer,
  -- Metrics the ride supports, e.g. ["heart_rate","cadence","calories"].
  add column if not exists metrics_available            text[],
  add column if not exists muscle_group_score           jsonb,
  -- A coarse enum (beginner/intermediate/advanced); mostly null today.
  add column if not exists difficulty_level             text;

-- Backfill from raw_data (ride metadata is reliably top-level here).

update rides set class_type_ids = array(
  select jsonb_array_elements_text(raw_data->'class_type_ids')
)
where class_type_ids is null
  and jsonb_typeof(raw_data->'class_type_ids') = 'array';

update rides set instructor_id = raw_data->>'instructor_id'
  where instructor_id is null and raw_data ? 'instructor_id';

update rides set series_id = raw_data->>'series_id'
  where series_id is null and raw_data ? 'series_id';

update rides set ride_type_id = raw_data->>'ride_type_id'
  where ride_type_id is null and raw_data ? 'ride_type_id';

update rides set studio_location = raw_data->>'location'
  where studio_location is null and raw_data ? 'location';

update rides set origin_locale = raw_data->>'origin_locale'
  where origin_locale is null and raw_data ? 'origin_locale';

update rides set language = raw_data->>'language'
  where language is null and raw_data ? 'language';

update rides set length_seconds = (raw_data->>'length')::integer
  where length_seconds is null and (raw_data->>'length') ~ '^[0-9]+$';

update rides set pedaling_duration_seconds = (raw_data->>'pedaling_duration')::integer
  where pedaling_duration_seconds is null and (raw_data->>'pedaling_duration') ~ '^[0-9]+$';

update rides set pedaling_start_offset = (raw_data->>'pedaling_start_offset')::integer
  where pedaling_start_offset is null and (raw_data->>'pedaling_start_offset') ~ '^-?[0-9]+$';

update rides set pedaling_end_offset = (raw_data->>'pedaling_end_offset')::integer
  where pedaling_end_offset is null and (raw_data->>'pedaling_end_offset') ~ '^-?[0-9]+$';

update rides set metrics_available = array(
  select jsonb_array_elements_text(raw_data->'metrics')
)
where metrics_available is null
  and jsonb_typeof(raw_data->'metrics') = 'array';

update rides set muscle_group_score = raw_data->'muscle_group_score'
  where muscle_group_score is null
    and jsonb_typeof(raw_data->'muscle_group_score') = 'array';

update rides set difficulty_level = raw_data->>'difficulty_level'
  where difficulty_level is null and raw_data ? 'difficulty_level';

-- 3. Supporting indexes ---------------------------------------------------
-- The GIN index on class_type_ids lets us filter "all Tabata rides" with
-- `where class_type_ids && array['<tabata-id>']` cheaply.

create index if not exists rides_class_type_ids_idx
  on rides using gin (class_type_ids);

create index if not exists rides_instructor_id_idx
  on rides(instructor_id);

create index if not exists rides_series_id_idx
  on rides(series_id);

-- ============================================================
-- Done.
-- ============================================================
