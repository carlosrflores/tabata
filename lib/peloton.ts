import type {
  PelotonWorkoutSummary,
  PelotonWorkoutPerformance,
} from '@/types'

const PELOTON_BASE = 'https://api.onepeloton.com'

interface PelotonSession {
  token: string
  userId: string
}

// Validate a bearer token by calling /api/me and return the user ID
// Peloton's /auth/login endpoint was shut down in October 2025;
// users must now supply a bearer token from their browser session.
export async function authenticatePeloton(
  bearerToken: string
): Promise<PelotonSession> {
  const token = bearerToken.startsWith('Bearer ')
    ? bearerToken.slice(7)
    : bearerToken

  const res = await fetch(`${PELOTON_BASE}/api/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Peloton token validation failed (${res.status}): ${text}`)
  }

  const data = await res.json()
  const userId: string = data.id

  if (!userId) {
    throw new Error('Peloton /api/me response missing user id')
  }

  return { token, userId }
}

// Fetch a page of workouts for a user
// Peloton paginates at 20 workouts per page by default
export async function fetchWorkoutList(
  session: PelotonSession,
  page = 0,
  limit = 20
): Promise<{ workouts: PelotonWorkoutSummary[]; total: number }> {
  const url = `${PELOTON_BASE}/api/user/${session.userId}/workouts?joins=ride,ride.instructor&limit=${limit}&page=${page}&sort_by=-created`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${session.token}` },
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch workout list (${res.status})`)
  }

  const data = await res.json()
  return {
    workouts: data.data ?? [],
    total: data.total ?? 0,
  }
}

// Fetch detailed summary for a single workout (includes leaderboard rank)
export async function fetchWorkoutSummary(
  session: PelotonSession,
  workoutId: string
): Promise<PelotonWorkoutSummary> {
  const res = await fetch(
    `${PELOTON_BASE}/api/workout/${workoutId}?joins=ride,ride.instructor`,
    { headers: { Authorization: `Bearer ${session.token}` } }
  )

  if (!res.ok) {
    throw new Error(`Failed to fetch workout ${workoutId} (${res.status})`)
  }

  return res.json()
}

// Fetch performance graph (avg cadence, resistance, speed, output)
export async function fetchWorkoutPerformance(
  session: PelotonSession,
  workoutId: string
): Promise<PelotonWorkoutPerformance> {
  const res = await fetch(
    `${PELOTON_BASE}/api/workout/${workoutId}/performance_graph?every_n=5`,
    { headers: { Authorization: `Bearer ${session.token}` } }
  )

  if (!res.ok) {
    // Performance graph sometimes 404s for non-cycling workouts — not fatal
    if (res.status === 404 || res.status === 500) {
      return { duration: 0, avg_summaries: [], summaries: [] }
    }
    throw new Error(`Failed to fetch performance for ${workoutId} (${res.status})`)
  }

  return res.json()
}

// Helper: extract a named metric from the avg_summaries array
export function extractAvgMetric(
  perf: PelotonWorkoutPerformance,
  name: string
): number | null {
  const metric = perf.avg_summaries?.find(
    (s) => s.display_name.toLowerCase() === name.toLowerCase()
  )
  return metric?.value ?? null
}

// Fetch all NEW workouts for a user (stops when it hits known IDs)
// knownIds is the set of peloton_workout_ids already in the database
export async function fetchNewWorkouts(
  session: PelotonSession,
  knownIds: Set<string>,
  maxPages = 10
): Promise<PelotonWorkoutSummary[]> {
  const newWorkouts: PelotonWorkoutSummary[] = []

  for (let page = 0; page < maxPages; page++) {
    const { workouts } = await fetchWorkoutList(session, page)

    if (workouts.length === 0) break

    let foundExisting = false
    for (const workout of workouts) {
      if (knownIds.has(workout.id)) {
        foundExisting = true
        break
      }
      // Only sync completed workouts
      if (workout.status === 'COMPLETE') {
        newWorkouts.push(workout)
      }
    }

    // Once we hit a workout we already have, no need to paginate further
    if (foundExisting) break

    // Rate-limit courtesy: small delay between pages
    if (page < maxPages - 1) {
      await new Promise((r) => setTimeout(r, 300))
    }
  }

  return newWorkouts
}
