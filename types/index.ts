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
}

export interface LeaderboardEntry {
  member_id: string
  name: string
  initials: string
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
}

// Raw shape of Peloton's /api/ride/{id}?joins=instructor response.
// Field names inferred from the `Ride` schema below; verify by inspecting
// a real response if any of these end up null when they shouldn't be.
export interface PelotonRide {
  id: string
  title?: string | null
  description?: string | null
  duration?: number | null
  fitness_discipline?: string | null
  difficulty_estimate?: number | null
  overall_rating_avg?: number | null
  total_workouts?: number | null
  total_ratings?: number | null
  image_url?: string | null
  original_air_time?: number | null   // unix seconds
  has_pedaling_metrics?: boolean
  is_explicit?: boolean
  instructor?: {
    name?: string | null
    image_url?: string | null
  } | null
}

export interface PelotonWorkoutPerformance {
  duration: number
  avg_summaries: Array<{
    display_name: string
    display_unit: string
    value: number
  }>
  summaries: Array<{
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