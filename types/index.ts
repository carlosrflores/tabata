export interface Member {
  id: string
  name: string
  peloton_username: string
  peloton_user_id: string
  initials: string
  is_owner: boolean
  created_at: string
}

export interface Workout {
  id: string
  member_id: string
  peloton_workout_id: string
  workout_date: string
  fitness_discipline: string
  title: string
  instructor_name: string | null
  duration_seconds: number
  total_output_kj: number | null
  avg_watts: number | null
  avg_cadence: number | null
  avg_resistance: number | null
  avg_speed: number | null
  distance_miles: number | null
  calories: number | null
  leaderboard_rank: number | null
  leaderboard_total: number | null
  difficulty_rating: number | null
  ride_id: string | null
  is_personal_record: boolean
  created_at: string
  // Extended Peloton metrics (see supabase/extended_metrics_migration.sql).
  end_time: string | null
  platform: string | null
  device_type: string | null
  timezone: string | null
  workout_type: string | null
  is_outdoor: boolean | null
  has_paused: boolean | null
  ftp_watts: number | null
  ftp_source: string | null
  strive_score: number | null
  heart_rate_zone_durations: Record<string, number> | null
  avg_heart_rate: number | null
  max_heart_rate: number | null
  max_watts: number | null
  max_cadence: number | null
  max_resistance: number | null
  max_speed: number | null
  perceived_effort_rating: number | null
  achievements: PelotonAchievement[] | null
}

export interface PelotonAchievement {
  id: string
  name: string
  slug: string
  image_url: string | null
  description: string | null
}

export interface LeaderboardEntry {
  member_id: string
  name: string
  initials: string
  image_url: string | null
  total_output_kj: number
  workout_count: number
  best_leaderboard_rank: number | null
  best_leaderboard_total: number | null
  leaderboard_percentile: number | null
  streak_weeks: number
  is_you: boolean
}

export interface WeeklyStats {
  week_start: string
  week_end: string
  group_total_output_kj: number
  active_members: number
  total_members: number
  top_performer: string
  top_output_kj: number
}

export interface PersonalRecord {
  duration_minutes: number
  workout_title: string
  instructor_name: string | null
  workout_date: string
  total_output_kj: number
}

export interface PelotonWorkoutSummary {
  id: string
  fitness_discipline: string
  title: string
  start_time: number
  end_time: number
  status: string
  total_work: number
  is_total_work_personal_record: boolean
  leaderboard_rank: number | null
  total_leaderboard_users: number | null
  ride?: {
    id: string
    title: string
    difficulty_rating_avg: number | null
    instructor?: {
      name: string
    }
    duration: number
  }
  metrics_type: string
  // Context + authored metrics (all optional — Peloton omits them for some
  // workout types, e.g. freestyle rides have no ride/ftp/HR data).
  platform?: string | null
  device_type?: string | null
  timezone?: string | null
  workout_type?: string | null
  is_outdoor?: boolean | null
  has_paused?: boolean | null
  ftp_info?: {
    ftp?: number | null
    ftp_source?: string | null
    ftp_workout_id?: string | null
  } | null
  average_effort_score?: number | null
  total_heart_rate_zone_durations?: Record<string, number> | null
  ratings?: {
    perceived_effort_rating?: number | null
  } | null
  achievement_templates?: PelotonAchievement[] | null
}

// Raw shape of Peloton's /api/ride/{id}?joins=instructor response.
// Field names verified against actual production raw_data (see
// extended_metrics_migration.sql).
export interface PelotonRide {
  id: string
  title?: string | null
  description?: string | null
  duration?: number | null
  // The scheduled slot length including intro/outro — longer than `duration`.
  length?: number | null
  fitness_discipline?: string | null
  difficulty_estimate?: number | null
  difficulty_level?: string | null
  overall_rating_avg?: number | null
  total_workouts?: number | null
  total_ratings?: number | null
  image_url?: string | null
  original_air_time?: number | null   // unix seconds
  has_pedaling_metrics?: boolean
  is_explicit?: boolean
  // Class classification — this is how Peloton tags Tabata vs Climb vs
  // Intervals rides. Nullable because freestyle workouts have no ride.
  class_type_ids?: string[] | null
  ride_type_id?: string | null
  series_id?: string | null
  instructor_id?: string | null
  // Studio code (e.g. psny-studio-1, psl-studio-3, uk).
  location?: string | null
  origin_locale?: string | null
  language?: string | null
  pedaling_duration?: number | null
  pedaling_start_offset?: number | null
  pedaling_end_offset?: number | null
  // Which metrics the class exposes, e.g. ["heart_rate", "cadence", "calories"].
  metrics?: string[] | null
  muscle_group_score?: Array<Record<string, unknown>> | null
  instructor?: {
    id?: string | null
    name?: string | null
    image_url?: string | null
  } | null
}

export interface PelotonWorkoutPerformance {
  duration: number
  average_summaries: Array<{
    display_name: string
    display_unit: string
    value: number
  }>
  summaries: Array<{
    display_name: string
    display_unit: string
    value: number
  }>
  // Peloton returns per-metric peaks here (Max Output / Max Cadence /
  // Max Resistance / Max Speed / Max Heart Rate) when available.
  max_summaries?: Array<{
    display_name: string
    display_unit: string
    value: number
  }>
}

// ============================================================
// Rides feature types
// ============================================================

export interface Ride {
  id: string
  title: string | null
  description: string | null
  instructor_name: string | null
  instructor_image_url: string | null
  duration_seconds: number | null
  fitness_discipline: string | null
  difficulty_estimate: number | null
  overall_rating_avg: number | null
  total_workouts: number | null
  total_ratings: number | null
  image_url: string | null
  original_air_time: string | null
  has_pedaling_metrics: boolean
  is_explicit: boolean
  // Extended ride metadata (see supabase/extended_metrics_migration.sql).
  class_type_ids: string[] | null
  instructor_id: string | null
  series_id: string | null
  ride_type_id: string | null
  studio_location: string | null
  origin_locale: string | null
  language: string | null
  length_seconds: number | null
  pedaling_duration_seconds: number | null
  pedaling_start_offset: number | null
  pedaling_end_offset: number | null
  metrics_available: string[] | null
  muscle_group_score: Array<Record<string, unknown>> | null
  difficulty_level: string | null
}

// One row per (ride, member) — that member's best attempt at the ride.
// From the `ride_comparison` view.
export interface RideComparisonRow {
  ride_id: string
  member_id: string
  member_name: string
  member_initials: string
  member_active: boolean
  workout_id: string
  workout_date: string
  total_output_kj: number | null
  avg_watts: number | null
  avg_cadence: number | null
  avg_resistance: number | null
  avg_speed: number | null
  distance_miles: number | null
  calories: number | null
  leaderboard_rank: number | null
  leaderboard_total: number | null
  leaderboard_percentile: number | null
  is_personal_record: boolean
  total_attempts: number
}

// From the `ride_popularity` view.
export interface RidePopularityRow {
  ride_id: string
  title: string | null
  image_url: string | null
  duration_seconds: number | null
  fitness_discipline: string | null
  original_air_time: string | null
  instructor_name: string | null
  instructor_image_url: string | null
  group_member_count: number
  group_attempt_count: number
  most_recent_attempt: string
  group_best_output_kj: number | null
}

// Sortable columns on the comparison page.
export type SortableColumn =
  | 'member_name'
  | 'workout_date'
  | 'total_output_kj'
  | 'avg_watts'
  | 'avg_cadence'
  | 'avg_resistance'
  | 'avg_speed'
  | 'distance_miles'
  | 'calories'
  | 'leaderboard_percentile'

export type SortDirection = 'asc' | 'desc'

// Lightweight active member shape for the "haven't taken yet" footer.
export interface ActiveMember {
  id: string
  name: string
  initials: string
}