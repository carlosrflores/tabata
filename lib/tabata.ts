// Parsing helpers for Peloton scheduled-class share links and the
// Tabata Tuesday week convention.

export interface ScheduledClassInfo {
  rideId: string
  scheduledStart: Date | null
  hostPelotonUserId: string | null
}

// Peloton share links look like:
//   https://members.onepeloton.com/scheduled/class/<ride_id>/<host_peloton_id>
//     ?join_token=<urlencoded base64 JSON>&start=...&type=...
//
// The join_token decodes to:
//   { home_peloton_id, ride_id, scheduled_start_time (unix s),
//     studio_peloton_id, type }
//
// Prefer the token (it carries the exact scheduled time); fall back to the
// path segments so a truncated link still yields the ride.
export function parseScheduledClassUrl(raw: string): ScheduledClassInfo | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  let url: URL | null = null
  try {
    url = new URL(trimmed)
  } catch {
    url = null
  }

  const joinToken = url?.searchParams.get('join_token')
  if (joinToken) {
    try {
      const payload = JSON.parse(atob(joinToken))
      if (typeof payload?.ride_id === 'string' && payload.ride_id) {
        return {
          rideId: payload.ride_id,
          scheduledStart:
            typeof payload.scheduled_start_time === 'number'
              ? new Date(payload.scheduled_start_time * 1000)
              : null,
          hostPelotonUserId:
            typeof payload.home_peloton_id === 'string'
              ? payload.home_peloton_id
              : null,
        }
      }
    } catch {
      // Malformed token — fall through to the path parse.
    }
  }

  const pathMatch = trimmed.match(
    /scheduled\/class\/([0-9a-f]{32})(?:\/([0-9a-f]{32}))?/i
  )
  if (pathMatch) {
    return {
      rideId: pathMatch[1],
      scheduledStart: null,
      hostPelotonUserId: pathMatch[2] ?? null,
    }
  }

  return null
}

// The Tabata week is Tuesday → Tuesday (see weekly_leaderboard in
// supabase/schema.sql). Given any instant, return the Tuesday (UTC date,
// YYYY-MM-DD) that starts its week.
export function tabataWeekStart(d: Date): string {
  const utc = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  )
  // getUTCDay(): 0=Sun … 2=Tue. Days since the most recent Tuesday:
  const daysSinceTuesday = (utc.getUTCDay() - 2 + 7) % 7
  utc.setUTCDate(utc.getUTCDate() - daysSinceTuesday)
  return utc.toISOString().slice(0, 10)
}
