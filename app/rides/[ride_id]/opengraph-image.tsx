// Dynamic Open Graph / Twitter Card image for a ride.
//
// Rendered on demand by Next.js when a preview crawler (iMessage, Slack,
// Twitter, etc.) hits /rides/<id>. The class image fills the background;
// the group's best performance stats sit overlaid on the left.
//
// Re-renders at most every 10 minutes so the preview updates as group
// bests change without hammering Supabase on every crawler hit.
//
// IMPORTANT: Satori (under next/og) silently fails the entire render when
// text is a direct child of a `display: flex` element. Every leaf div
// that holds text here deliberately OMITS `display: flex`.

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
    // ride / best stay null; fallback preview renders below.
  }

  const bestName = best?.member_name
  const bgUrl = ride?.image_url ?? null

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
          position: 'relative',
          background:
            'linear-gradient(135deg, #1a0b2e 0%, #2d1b4e 50%, #0a0a0a 100%)',
          color: 'white',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Background class image — Satori fetches it inline. If the
            fetch fails Satori falls back to the gradient on the parent. */}
        {bgUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bgUrl}
            alt=""
            width={1200}
            height={630}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 1200,
              height: 630,
              objectFit: 'cover',
            }}
          />
        )}

        {/* Dark gradient overlay for legibility against the photo */}
        {bgUrl && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              background:
                'linear-gradient(110deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.25) 100%)',
            }}
          />
        )}

        {/* Foreground (positioned relative so it stacks above the bg) */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            width: 1200,
            height: 630,
            padding: '50px 70px',
          }}
        >
          {/* Top row: branding (left) + group-best name (right) */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 56,
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
                color: 'rgba(255,255,255,0.9)',
                textShadow: '0 1px 3px rgba(0,0,0,0.5)',
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
                      textShadow: '0 2px 6px rgba(0,0,0,0.6)',
                    }}
                  >
                    {s.value}
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      letterSpacing: 2,
                      color: 'rgba(255,255,255,0.75)',
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
                fontSize: 28,
                color: 'rgba(255,255,255,0.8)',
                textShadow: '0 1px 3px rgba(0,0,0,0.5)',
              }}
            >
              No one in the group has taken this ride yet.
            </div>
          )}
        </div>
      </div>
    ),
    { ...size }
  )
}
