import type { Metadata } from 'next'
import './globals.css'

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
      <body className="bg-gray-50 min-h-screen antialiased">
        <div className="max-w-lg mx-auto px-4 py-6">
          {children}
        </div>
      </body>
    </html>
  )
}
