import type { Metadata } from 'next'
import './globals.css'
import { Suspense } from 'react'
import SiteNav from './components/SiteNav'
import NavigationProgress from './components/NavigationProgress'

export const metadata: Metadata = {
  title: 'Tabata Tuesday',
  description: 'Group Peloton leaderboard for Tabata Tuesday',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100/60 text-gray-900 antialiased">
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <SiteNav />
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </body>
    </html>
  )
}
