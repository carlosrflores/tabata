'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

// Click feedback for in-app navigation. The App Router has no route-change
// events, so this watches clicks on same-origin links: on click it shows a
// progress bar at the top of the page, marks the clicked link
// `data-pending` (dimmed via globals.css), and adds `is-navigating` to
// <html> (progress cursor + the nav spinner). Everything clears once the
// pathname or query string changes.
export default function NavigationProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')
  const pendingLink = useRef<HTMLAnchorElement | null>(null)
  const safety = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return
      const url = new URL(a.href, window.location.href)
      if (url.origin !== window.location.origin) return
      // Same page (or just a #hash jump): nothing will load.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return

      pendingLink.current?.removeAttribute('data-pending')
      a.setAttribute('data-pending', '')
      pendingLink.current = a
      document.documentElement.classList.add('is-navigating')
      setState('loading')
      clearTimeout(safety.current)
      safety.current = setTimeout(finish, 15000)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  useEffect(() => {
    finish()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams])

  function finish() {
    clearTimeout(safety.current)
    pendingLink.current?.removeAttribute('data-pending')
    pendingLink.current = null
    document.documentElement.classList.remove('is-navigating')
    setState((s) => (s === 'loading' ? 'done' : s))
  }

  useEffect(() => {
    if (state !== 'done') return
    const t = setTimeout(() => setState('idle'), 300)
    return () => clearTimeout(t)
  }, [state])

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5"
    >
      <div
        className={
          'h-full bg-gradient-to-r from-purple-400 to-purple-600 shadow-[0_0_8px_rgb(147_51_234/0.6)] ' +
          (state === 'loading'
            ? 'w-[85%] opacity-100 transition-[width] duration-[8000ms] ease-out'
            : state === 'done'
              ? 'w-full opacity-0 transition-all duration-300'
              : 'w-0 opacity-0')
        }
      />
    </div>
  )
}
