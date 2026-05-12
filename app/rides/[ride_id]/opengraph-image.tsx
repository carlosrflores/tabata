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

// Try to fetch the background image as a data URL so Satori can embed it
// inline. Fail soft: if anything goes wrong (slow S3, oversized image, weird
// content-type) we skip the background rather than crashing the whole
// render, which would otherwise return an empty PNG that gets cached for a
// year.
async function tryFetchImageDataUrl(url: string): Promise<string | null> {
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(t)
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? 'image/png'
    const buf = await res.arrayBuffer()
    if (buf.byteLength > 1_500_000) return null // skip very large images
    // base64 in edge runtime: btoa with binary string from Uint8Array
    let binary = ''
    const bytes = new Uint8Array(buf)
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    return `data:${contentType};base64,${btoa(binary)}`
  } catch {
    return null
  }
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

  const bgDataUrl = ride?.image_url
    ? await tryFetchImageDataUrl(ride.image_url)
    : null

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
        {bgDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bgDataUrl}
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

        {bgDataUrl && (
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

        {/* Foreground content */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            width: 1200,
            height: 630,
            padding: '60px 70px',
          }}
        >
          {/* Top row: branding + group-best name */}
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

          {/* Stats grid (column) */}
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
