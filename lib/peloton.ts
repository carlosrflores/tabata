import type {
  PelotonWorkoutSummary,
  PelotonWorkoutPerformance,
  PelotonRide,
} from '@/types'

const PELOTON_BASE = 'https://api.onepeloton.com'
const PELOTON_AUTH_BASE = 'https://auth.onepeloton.com'

export interface PelotonSession {
  token: string
  userId: string
}

// Build a session directly from stored credentials without calling /api/me.
// Use this when you already know the token is valid (e.g. it was just stored)
// or when the /api/me validation step is unavailable (e.g. IP routing issues).
export function createSession(token: string, userId: string): PelotonSession {
  return { token: token.startsWith('Bearer ') ? token.slice(7) : token, userId }
}

// Build the headers Peloton's API expects.
// Since Oct 2025, Peloton uses Auth0 OAuth — all API calls require
// an OAuth access token (not the old session cookie).
function pelotonHeaders(token: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
    'Peloton-Platform': 'web',
    'Accept': 'application/json',
  }
}

export interface RefreshedPelotonTokens {
  accessToken: string
  refreshToken: string  // may be the same as input if Auth0 didn't rotate it
  expiresAt: string     // ISO timestamp computed from expires_in
}

// Exchange a refresh token for a fresh access token via Auth0.
// Throws on any non-2xx response or missing access_token.
//
// Auth0 rotates refresh tokens by default; the caller MUST persist whatever
// comes back in `refreshToken`. If the response unexpectedly omits one, we
// fall back to the input refresh token so the caller can keep using it.
export async function refreshPelotonToken(
  refreshToken: string,
  clientId: string
): Promise<RefreshedPelotonTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refreshToken,
  })

  const res = await fetch(`${PELOTON_AUTH_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body,
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(
      `Peloton token refresh failed (${res.status}): ${text.slice(0, 200)}`
    )
  }

  const data = await res.json()
  if (typeof data.access_token !== 'string' || !data.access_token) {
    throw new Error('Peloton token refresh response missing access_token')
  }

  const expiresInSec = typeof data.expires_in === 'number' ? data.expires_in : 0
  return {
    accessToken: data.access_token,
    refreshToken:
      typeof data.refresh_token === 'string' && data.refresh_token
        ? data.refresh_token
        : refreshToken,
    expiresAt: new Date(Date.now() + expiresInSec * 1000).toISOString(),
  }
}

// Validate an OAuth access token by calling /api/me and return the user ID.
// Peloton's /auth/login was shut down Oct 2025; tokens now come from
// the Auth0 PKCE flow at auth.onepeloton.com (or from browser DevTools).
// Tokens expire every ~48 hours.
export async function authenticatePeloton(
  bearerToken: string
): Promise<PelotonSession> {
  // Accept either "Bearer xxx" or raw "xxx"
  const token = bearerToken.startsWith('Bearer ')
    ? bearerToken.slice(7)
    : bearerToken

  const res = await fetch(`${PELOTON_BASE}/api/me`, {
    headers: pelotonHeaders(token),
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text()
    if (res.status === 401) {
      throw new Error(
        'Peloton token rejected (401). The token may be expired — they last ~48 hours. ' +
        'Log into onepeloton.com and copy a fresh token from DevTools.'
      )
    }
    throw new Error(`Peloton token validation failed (${res.status}): ${text}`)
  }

  const data = await res.json()
  const userId: string = data.id

  if (!userId) {
    throw new Error('Peloton /api/me response missing user id')
  }

  return { token, userId }
}

export interface PelotonFollowingUser {
  id: string
  username: string
  name: string | null
  image_url: string | null
}

// Fetch one page of users that the session user follows.
export async function fetchFollowing(
  session: PelotonSession,
  page = 0,
  limit = 100
): Promise<{ users: PelotonFollowingUser[]; total: number }> {
  const res = await fetch(
    `${PELOTON_BASE}/api/user/${session.userId}/following?limit=${limit}&page=${page}`,
    { headers: pelotonHeaders(session.token), cache: 'no-store' }
  )
  if (!res.ok) {
    throw new Error(`Failed to fetch following list (${res.status})`)
  }
  const data = await res.json()
  const raw: Array<Record<string, unknown>> = data.data ?? []
  const users: PelotonFollowingUser[] = raw.map((u) => ({
    id: String(u.id ?? ''),
    username: String(u.username ?? ''),
    name: (u.name as string | null) ?? null,
    image_url: (u.image_url as string | null) ?? null,
  }))
  return { users, total: data.total ?? 0 }
}

// Fetch the full list of users the session user follows (auto-paginates).
export async function fetchAllFollowing(
  session: PelotonSession
): Promise<PelotonFollowingUser[]> {
  const all: PelotonFollowingUser[] = []
  const limit = 100
  let page = 0
  while (true) {
    const { users, total } = await fetchFollowing(session, page, limit)
    all.push(...users)
    if (all.length >= total || users.length < limit) break
    page++
    await new Promise((r) => setTimeout(r, 200))
  }
  return all
}

// Fetch a page of workouts for a user.
// Pass targetUserId to fetch another user's workouts using the session's token
// (requires the session user to follow targetUserId on Peloton).
// Peloton paginates at 20 workouts per page by default.
export async function fetchWorkoutList(
  session: PelotonSession,
  page = 0,
  limit = 20,
  targetUserId?: string
): Promise<{ workouts: PelotonWorkoutSummary[]; total: number }> {
  const userId = targetUserId ?? session.userId
  const url = `${PELOTON_BASE}/api/user/${userId}/workouts?joins=ride,ride.instructor&limit=${limit}&page=${page}&sort_by=-created`

  const res = await fetch(url, {
    headers: pelotonHeaders(session.token),
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Failed to fetch workout list (${res.status}): ${body.slice(0, 300)}`)
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
    { headers: pelotonHeaders(session.token), cache: 'no-store' }
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
    { headers: pelotonHeaders(session.token), cache: 'no-store' }
  )

  if (!res.ok) {
    // Performance graph sometimes 404s for non-cycling workouts — not fatal
    if (res.status === 404 || res.status === 500) {
      return { duration: 0, average_summaries: [], summaries: [] }
    }
    throw new Error(`Failed to fetch performance for ${workoutId} (${res.status})`)
  }

  return res.json()
}

// Helper: extract a named metric from the average_summaries array
export function extractAvgMetric(
  perf: PelotonWorkoutPerformance,
  name: string
): number | null {
  const metric = perf.average_summaries?.find(
    (s) => s.display_name.toLowerCase() === name.toLowerCase()
  )
  return metric?.value ?? null
}

// Helper: extract a named metric from the summaries array (Total Output, Distance, Calories)
export function extractSummaryMetric(
  perf: PelotonWorkoutPerformance,
  name: string
): number | null {
  const metric = perf.summaries?.find(
    (s) => s.display_name.toLowerCase() === name.toLowerCase()
  )
  return metric?.value ?? null
}

// Fetch full metadata for a single ride (class).
// Used by the sync job to populate the `rides` table.
//
// Field-mapping notes (inferred from the `Ride` DB schema; verify against a
// real response if any column is unexpectedly null):
//   - difficulty_estimate    → ride.difficulty_estimate (crowdsourced 1–10)
//   - overall_rating_avg     → ride.overall_rating_avg
//   - original_air_time      → ride.original_air_time (unix seconds → ISO)
//   - instructor_name        → ride.instructor.name (joined via ?joins=instructor)
//   - instructor_image_url   → ride.instructor.image_url
export async function fetchRide(
  session: PelotonSession,
  rideId: string
): Promise<PelotonRide> {
  const res = await fetch(
    `${PELOTON_BASE}/api/ride/${rideId}?joins=instructor`,
    { headers: pelotonHeaders(session.token), cache: 'no-store' }
  )

  if (!res.ok) {
    throw new Error(`Failed to fetch ride ${rideId} (${res.status})`)
  }

  return res.json()
}

// Fetch all NEW workouts for a user (stops when it hits known IDs).
// knownIds is the set of peloton_workout_ids already in the database.
// Pass targetUserId to fetch another user's workouts using the session's token.
//
// When we encounter a known ID we keep scanning the current page (Peloton can
// return records slightly out of order during eventual consistency, so a
// newer-but-unsynced workout may appear after a known one) and then fetch ONE
// extra page before stopping. Bounded by maxPages so this can never run away.
export async function fetchNewWorkouts(
  session: PelotonSession,
  knownIds: Set<string>,
  maxPages = 10,
  targetUserId?: string
): Promise<PelotonWorkoutSummary[]> {
  const newWorkouts: PelotonWorkoutSummary[] = []

  const collect = (workouts: PelotonWorkoutSummary[]) => {
    for (const w of workouts) {
      if (!knownIds.has(w.id) && w.status === 'COMPLETE') {
        newWorkouts.push(w)
      }
    }
  }

  for (let page = 0; page < maxPages; page++) {
    const { workouts } = await fetchWorkoutList(session, page, 20, targetUserId)

    if (workouts.length === 0) break

    const foundExisting = workouts.some((w) => knownIds.has(w.id))
    collect(workouts)

    if (foundExisting) {
      // Lookahead one page: insurance against Peloton's eventual consistency
      // placing a newer workout below a known one across the page boundary.
      const lookahead = page + 1
      if (lookahead < maxPages) {
        await new Promise((r) => setTimeout(r, 300))
        const { workouts: extra } = await fetchWorkoutList(
          session,
          lookahead,
          20,
          targetUserId
        )
        collect(extra)
      }
      break
    }

    // Rate-limit courtesy: small delay between pages
    if (page < maxPages - 1) {
      await new Promise((r) => setTimeout(r, 300))
    }
  }

  return newWorkouts
}
