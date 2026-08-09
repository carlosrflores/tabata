import { redirect } from 'next/navigation'
import { getAppUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Server-side gate for every /admin page: only signed-in admins get the
// UI. (Pickers use the inline box on /tabata; machines use CRON_SECRET
// against the APIs directly.)
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getAppUser()
  if (!user || user.role !== 'admin') {
    redirect('/login')
  }

  return (
    <div>
      <div className="mx-auto mb-4 flex max-w-3xl items-center justify-end gap-3 text-xs text-gray-400">
        <span>{user.email}</span>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-full border border-gray-200 px-2.5 py-1 transition-colors hover:bg-gray-50 hover:text-gray-600"
          >
            Sign out
          </button>
        </form>
      </div>
      {children}
    </div>
  )
}
