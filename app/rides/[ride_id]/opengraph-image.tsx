// Dynamic Open Graph / Twitter Card image for a ride.
//
// Rendered on demand by Next.js when a preview crawler (iMessage, Slack,
// Twitter, etc.) hits /rides/<id>. The class image is the background; the
// foreground shows the group's best performance stats — closer in spirit to
// the rich preview the Peloton app sends than to a bare link.
//
// Re-renders at most every 10 minutes so the preview updates as group bests
// change without a per-fetch hit on Supabase.

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
  duration_seconds: number | null
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
  const db = getSupabaseAdmin()

  const [rideRes, bestRes] = await Promise.all([
    db
      .from('rides')
      .select('id, title, instructor_name, image_url, duration_seconds')
      .eq('id', params.ride_id)
      .single<RideRow>(),
    db
      .from('ride_comparison')
      .select('member_name, total_output_kj, avg_watts, distance_miles, calories')
      .eq('ride_id', params.ride_id)
      .order('total_output_kj', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle<BestRow>(),
  ])

  const ride = rideRes.data
  const best = bestRes.data

  const stats: Array<{ value: string; label: string }> = []
  const output = fmtInt(best?.total_output_kj)
  const watts = fmtInt(best?.avg_watts)
  const miles = fmtFloat(best?.distance_miles)
  const cals = fmtInt(best?.calories)
  if (output) stats.push({ value: output, label: 'OUTPUT (KJ)' })
  if (watts) stats.push({ value: watts, label: 'AVG WATTS' })
  if (miles) stats.push({ value: miles, label: 'MILES' })
  if (cals) stats.push({ value: cals, label: 'CALORIES' })

  const title = ride?.title ?? 'Tabata Tuesday ride'
  const instructor = ride?.instructor_name
  const imageUrl = ride?.image_url

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          background: '#0a0a0a',
          color: 'white',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            width={1200}
            height={630}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        )}

        {/* Dark gradient overlay for legibility */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background:
              'linear-gradient(110deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.25) 100%)',
          }}
        />

        {/* Foreground content */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            padding: '60px 70px',
          }}
        >
          {/* Top row: branding right-aligned */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: '0.18em',
                color: '#c4a4ff',
              }}
            >
              TABATA TUESDAY
            </div>
            {best?.member_name && (
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 500,
                  letterSpacing: '0.06em',
                  color: 'rgba(255,255,255,0.75)',
                }}
              >
                GROUP BEST · {best.member_name.toUpperCase()}
              </div>
            )}
          </div>

          {/* Stats grid */}
          {stats.length > 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 18,
                marginTop: 40,
              }}
            >
              {stats.map((s) => (
                <div
                  key={s.label}
                  style={{ display: 'flex', flexDirection: 'column' }}
                >
                  <span
                    style={{
                      fontSize: 72,
                      fontWeight: 700,
                      lineHeight: 1,
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {s.value}
                  </span>
                  <span
                    style={{
                      fontSize: 18,
                      fontWeight: 600,
                      letterSpacing: '0.14em',
                      color: 'rgba(255,255,255,0.7)',
                      marginTop: 4,
                    }}
                  >
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
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
            <span
              style={{
                fontSize: 52,
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: '-0.01em',
              }}
            >
              {title}
            </span>
            {instructor && (
              <span
                style={{
                  fontSize: 30,
                  fontWeight: 500,
                  color: 'rgba(255,255,255,0.8)',
                  marginTop: 10,
                }}
              >
                with {instructor}
              </span>
            )}
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
