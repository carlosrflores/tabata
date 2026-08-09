import LoginForm from './LoginForm'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Sign in — Tabata Tuesday' }

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  return (
    <div className="mx-auto mt-16 max-w-sm px-4">
      <div className="rounded-3xl border border-gray-100 bg-white p-8">
        <h1 className="text-xl font-semibold text-gray-900">Sign in</h1>
        <p className="mt-1 text-sm text-gray-500">
          Enter your email and we&apos;ll send you a sign-in link. No
          password needed.
        </p>
        {searchParams.error && (
          <div className="mt-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
            {searchParams.error}
          </div>
        )}
        <LoginForm />
      </div>
    </div>
  )
}
