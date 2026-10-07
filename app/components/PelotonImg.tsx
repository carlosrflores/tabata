'use client'

import { useState, type ImgHTMLAttributes } from 'react'
import { pelotonImageUrl } from '@/lib/images'

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string
  // Rendered width in CSS pixels; the resized image is fetched at 2x.
  displayWidth: number
}

// <img> for Peloton-hosted images: resized via Peloton's image CDN, lazy
// by default, and falls back to the original URL if the resizer fails.
export default function PelotonImg({ src, displayWidth, loading = 'lazy', alt = '', ...rest }: Props) {
  const resized = pelotonImageUrl(src, displayWidth)
  const [current, setCurrent] = useState(resized)

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...rest}
      src={current}
      alt={alt}
      loading={loading}
      decoding="async"
      onError={() => {
        if (current !== src) setCurrent(src)
      }}
    />
  )
}
