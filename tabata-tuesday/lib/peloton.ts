import type {
  PelotonWorkoutSummary,
  PelotonWorkoutPerformance,
} from '@/types'

const PELOTON_BASE = 'https://api.onepeloton.com'

interface PelotonSession {
  cookie: string
  userId: string
}

// Authenticate with Peloton and return a session cookie
// This mirrors the approach from Al Chen's original scripts
export async function authenticatePeloton(
  username: string,
  password: string
): Promise<PelotonSession> {
  const res = await fetch(`${PELOTON_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username_or_email: username,
      password,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Peloton auth failed (${res.status}): ${text}`)
  }

  // Extract and clean the session cookie from response headers
  // Peloton returns multiple Set-Cookie headers; we need just the values
  const rawCookies = res.headers.getSetCookie?.() ?? []
  const cookie = rawCookies
    .map((c) => c.split(';')[0])
    .join('; ')

  const data = await res.json()
  const userId: string = data.user_id

  if (!cookie || !userId) {
    throw new Error('Peloton auth response missing cookie or user_id')
  }

  return { cookie, userId }
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
    headers: { Cookie: session.cookie },
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
    { headers: { Cookie: session.cookie } }
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
    { headers: { Cookie: session.cookie } }
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
