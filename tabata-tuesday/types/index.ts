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
    title: string
    difficulty_rating_avg: number | null
    instructor?: {
      name: string
    }
    duration: number
  }
  metrics_type: string
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
