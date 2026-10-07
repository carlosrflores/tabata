// Peloton serves class and profile images straight from S3 at full size
// (class art ~2 MB, avatars ~600 KB) — far too heavy for thumbnails.
// Peloton's own Cloudinary account resizes them on the fly; route S3 URLs
// through it at roughly 2x the displayed width for sharp retina rendering.
// Not an official API, so PelotonImg falls back to the original on error.

const PELOTON_S3 = 'https://s3.amazonaws.com/peloton-'
const RESIZER = 'https://res.cloudinary.com/peloton-cycle/image/fetch'

export function pelotonImageUrl(src: string, displayWidth: number): string {
  if (!src.startsWith(PELOTON_S3)) return src
  const w = Math.round(displayWidth * 2)
  return `${RESIZER}/f_auto,q_auto,w_${w}/${src}`
}
