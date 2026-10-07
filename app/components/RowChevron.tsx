// Trailing ">" for clickable rows and cards. Faint at rest; brightens and
// nudges right when the parent `group` is hovered, so the whole row reads
// as a link. Purely decorative.
export default function RowChevron({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`h-4 w-4 flex-shrink-0 text-gray-300 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-purple-500 ${className}`}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}
