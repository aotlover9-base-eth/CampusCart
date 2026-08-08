import type { SVGProps } from 'react'

/**
 * Empty-state illustrations — simple, geometric, and thematically consistent.
 * Used when a list, search, or feed has no data to show.
 */

export function EmptyBox(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 140 140"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <rect
        x="30"
        y="40"
        width="80"
        height="70"
        rx="8"
        stroke="var(--color-line-strong)"
        strokeWidth="2.5"
        fill="var(--color-surface-sunken)"
      />
      <path
        d="M45 55h50M45 70h50M45 85h30"
        stroke="var(--color-line)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="70" cy="50" r="18" fill="var(--color-surface)" opacity="0.5" />
    </svg>
  )
}

export function EmptySearch(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 140 140"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <circle
        cx="60"
        cy="60"
        r="28"
        stroke="var(--color-line-strong)"
        strokeWidth="3"
        fill="var(--color-surface-sunken)"
      />
      <path
        d="M82 82l22 22"
        stroke="var(--color-line-strong)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M50 55h20M50 65h15"
        stroke="var(--color-line)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function EmptyChat(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 140 140"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <rect
        x="25"
        y="35"
        width="70"
        height="50"
        rx="10"
        stroke="var(--color-line-strong)"
        strokeWidth="2.5"
        fill="var(--color-surface-sunken)"
      />
      <path d="M60 85v15l-10-10H35" stroke="var(--color-line-strong)" strokeWidth="2.5" />
      <path
        d="M40 50h40M40 65h25"
        stroke="var(--color-line)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="100" cy="65" r="15" fill="var(--color-surface)" opacity="0.5" />
    </svg>
  )
}

export function EmptyNotification(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 140 140"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M70 35v5a20 20 0 0 1 20 20v18c0 6 2 10 5 12H45c3-2 5-6 5-12V60a20 20 0 0 1 20-20v-5"
        stroke="var(--color-line-strong)"
        strokeWidth="2.5"
        fill="var(--color-surface-sunken)"
      />
      <path
        d="M62 90c0 4.4 3.6 8 8 8s8-3.6 8-8"
        stroke="var(--color-line-strong)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="85" cy="55" r="8" stroke="var(--color-line)" strokeWidth="2" />
    </svg>
  )
}

interface EmptyStateProps {
  illustration: 'box' | 'search' | 'chat' | 'notification'
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ illustration, title, description, action }: EmptyStateProps) {
  const Illustration = {
    box: EmptyBox,
    search: EmptySearch,
    chat: EmptyChat,
    notification: EmptyNotification,
  }[illustration]

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <Illustration className="h-32 w-32 mb-6 opacity-60" />
      <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--color-ink)' }}>
        {title}
      </h3>
      {description && (
        <p className="text-sm mb-6 max-w-sm" style={{ color: 'var(--color-ink-muted)' }}>
          {description}
        </p>
      )}
      {action}
    </div>
  )
}
