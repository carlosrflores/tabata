import Link from 'next/link'

export interface Crumb {
  label: string
  href?: string
}

export default function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null
  return (
    <nav aria-label="Breadcrumb" className="mb-5 text-xs">
      <ol className="flex flex-wrap items-center gap-1 text-gray-400">
        {items.map((item, i) => {
          const last = i === items.length - 1
          return (
            <li key={i} className="flex items-center gap-1">
              {item.href && !last ? (
                <Link
                  href={item.href}
                  className="rounded px-1 py-0.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={last ? 'text-gray-900' : 'text-gray-500'}
                  aria-current={last ? 'page' : undefined}
                >
                  {item.label}
                </span>
              )}
              {!last && <span className="text-gray-300">/</span>}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
