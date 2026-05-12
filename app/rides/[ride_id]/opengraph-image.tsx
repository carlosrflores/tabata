// Dynamic Open Graph / Twitter Card image for a ride.
//
// Rendered on demand by Next.js when a preview crawler (iMessage, Slack,
// Twitter, etc.) hits /rides/<id>. Renders the group's best performance
// stats — similar in spirit to the rich preview the Peloton app sends.
//
// Re-renders at most every 10 minutes so the preview updates as group bests
// change without hammering Supabase on every crawler hit.
//
// IMPORTANT: Satori (under next/og) silently fails when text is a direct
// child of a display:flex element. Every leaf div that holds text here has
// `display: flex` deliberately OMITTED. Flex layout is applied only to
// containers that hold other elements.

import { ImageResponse } from 'next/og'
import { getSupabaseAdmin } from '@/lib/supabase'

export const runtime = 'edge'
export const revalidate = 600
export const alt = 'Tabata Tuesday — ride comparison'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

interface RideRow {
  id: string
  title: string | null
  instructor_name: string | null
  image_url: string | null
}

interface BestRow {
  member_name: string | null
  total_output_kj: number | null
  avg_watts: number | null
  distance_miles: number | null
  calories: number | null
}

function fmtInt(n: number | null | undefined): string | null {
  if (n == null) return null
  return Math.round(n).toLocaleString()
}

function fmtFloat(n: number | null | undefined, digits = 2): string | null {
  if (n == null) return null
  return n.toFixed(digits)
}

export default async function RideOgImage({
  params,
}: {
  params: { ride_id: string }
}) {
  // Belt-and-suspenders error handling so even a Supabase outage produces
  // a readable preview instead of an empty PNG.
  let ride: RideRow | null = null
  let best: BestRow | null = null
  try {
    const db = getSupabaseAdmin()
    const [rideRes, bestRes] = await Promise.all([
      db
        .from('rides')
        .select('id, title, instructor_name, image_url')
        .eq('id', params.ride_id)
        .maybeSingle<RideRow>(),
      db
        .from('ride_comparison')
        .select('member_name, total_output_kj, avg_watts, distance_miles, calories')
        .eq('ride_id', params.ride_id)
        .order('total_output_kj', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle<BestRow>(),
    ])
    ride = rideRes.data
    best = bestRes.data
  } catch {
    // fall through with ride/best null
  }

  const title = ride?.title ?? 'Tabata Tuesday ride'
  const instructor = ride?.instructor_name
  const bestName = best?.member_name

  const stats: Array<{ value: string; label: string }> = []
  const output = fmtInt(best?.total_output_kj)
  const watts = fmtInt(best?.avg_watts)
  const miles = fmtFloat(best?.distance_miles)
  const cals = fmtInt(best?.calories)
  if (output) stats.push({ value: output, label: 'OUTPUT (KJ)' })
  if (watts) stats.push({ value: watts, label: 'AVG WATTS' })
  if (miles) stats.push({ value: miles, label: 'MILES' })
  if (cals) stats.push({ value: cals, label: 'CALORIES' })

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: '60px 70px',
          background:
            'linear-gradient(135deg, #1a0b2e 0%, #2d1b4e 50%, #0a0a0a 100%)',
          color: 'white',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Top row: branding (left) + group-best name (right) */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: 4,
              color: '#c4a4ff',
            }}
          >
            TABATA TUESDAY
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 500,
              letterSpacing: 1,
              color: 'rgba(255,255,255,0.75)',
            }}
          >
            {bestName ? `GROUP BEST · ${bestName.toUpperCase()}` : ''}
          </div>
        </div>

        {/* Stats column */}
        {stats.length > 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              marginTop: 40,
            }}
          >
            {stats.map((s) => (
              <div
                key={s.label}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  marginBottom: 18,
                }}
              >
                <div
                  style={{
                    fontSize: 72,
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  {s.value}
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    letterSpacing: 2,
                    color: 'rgba(255,255,255,0.7)',
                    marginTop: 4,
                  }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              marginTop: 60,
              fontSize: 26,
              color: 'rgba(255,255,255,0.7)',
            }}
          >
            No one in the group has taken this ride yet.
          </div>
        )}

        {/* Bottom block: title + instructor */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: 'auto',
          }}
        >
          <div
            style={{
              fontSize: 52,
              fontWeight: 700,
              lineHeight: 1.05,
            }}
          >
            {title}
          </div>
          {instructor && (
            <div
              style={{
                fontSize: 30,
                fontWeight: 500,
                color: 'rgba(255,255,255,0.8)',
                marginTop: 10,
              }}
            >
              with {instructor}
            </div>
          )}
        </div>
      </div>
    ),
    { ...size }
  )
}
