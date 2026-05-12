// Minimal diagnostic build of the OG image. If this renders we know the
// route + next/og + edge runtime is healthy and the issue is in the more
// complex JSX. Restoring the full design in the next commit.

import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Tabata Tuesday — ride comparison'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function RideOgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1a0b2e',
          color: 'white',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ fontSize: 96, fontWeight: 700 }}>Tabata Tuesday</div>
        <div style={{ fontSize: 32, marginTop: 24, opacity: 0.8 }}>
          ride preview
        </div>
      </div>
    ),
    { ...size }
  )
}
