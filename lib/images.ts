// Peloton serves class and profile images straight from S3 at full size
// (class art ~2 MB, avatars ~600 KB) — far too heavy for thumbnails.
// Peloton's own Cloudinary account resizes them on the fly; route S3 URLs
// through it at roughly 2x the displayed width for sharp retina rendering.
// Not an official API, so PelotonImg falls back to the original on error.

// Both S3 URL styles appear in Peloton data: path-style
// (s3.amazonaws.com/peloton-…) and virtual-hosted (peloton-….s3.amazonaws.com).
const PELOTON_S3 = /^https:\/\/(s3\.amazonaws\.com\/peloton-|peloton-[\w-]+\.s3\.amazonaws\.com\/)/
const RESIZER = 'https://res.cloudinary.com/peloton-cycle/image/fetch'

export function pelotonImageUrl(src: string, displayWidth: number): string {
  if (!PELOTON_S3.test(src)) return src
  const w = Math.round(displayWidth * 2)
  return `${RESIZER}/f_auto,q_auto,w_${w}/${src}`
}
