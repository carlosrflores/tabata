'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/', label: 'Leaderboard' },
  { href: '/rides', label: 'Rides' },
  { href: '/admin', label: 'Admin' },
]

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(href + '/')
}

export default function SiteNav() {
  const pathname = usePathname() ?? '/'

  return (
    <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-semibold text-gray-900"
        >
          <span
            className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 text-white shadow-sm"
            aria-hidden
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="6" width="3" height="7" rx="1" fill="currentColor" opacity="0.85" />
              <rect x="5.5" y="3" width="3" height="10" rx="1" fill="currentColor" />
              <rect x="10" y="0.5" width="3" height="12.5" rx="1" fill="currentColor" opacity="0.7" />
            </svg>
          </span>
          <span className="hidden sm:inline">Tabata Tuesday</span>
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          {LINKS.map((link) => {
            const active = isActive(pathname, link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={
                  'rounded-full px-3 py-1.5 transition-colors ' +
                  (active
                    ? 'bg-purple-50 text-purple-700'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900')
                }
              >
                {link.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
