'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Spinner from './Spinner'

const LINKS = [
  { href: '/', label: 'Leaderboard' },
  { href: '/tabata', label: 'Tabata' },
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
          <span className="grid h-8 w-8 place-items-center" aria-hidden>
            {/* Logo at rest; a spinner while a page is loading (html.is-navigating). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-mark.png"
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 [.is-navigating_&]:hidden"
            />
            <Spinner className="hidden h-4 w-4 text-brand-500 [.is-navigating_&]:block" />
          </span>
          <span className="hidden tracking-wide sm:inline">
            TABATA <span className="text-brand-600">TUESDAY</span>
          </span>
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
                  'press rounded-full px-3 py-1.5 transition-colors ' +
                  (active
                    ? 'bg-brand-50 text-brand-700'
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
