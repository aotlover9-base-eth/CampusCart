import { cn } from '@/lib/utils'

/**
 * Small inline labels: condition, status, role, and category chips.
 *
 * Tone maps to the monochrome system - `neutral` is the default and the only
 * one used in bulk; colour appears solely where it carries meaning (sold,
 * negotiable, free).
 */

type Tone = 'neutral' | 'solid' | 'success' | 'warning' | 'danger' | 'accent' | 'outline'

const TONES: Record<Tone, string> = {
  neutral: 'bg-[var(--color-surface-sunken)] text-[var(--color-ink-muted)]',
  solid: 'bg-[var(--color-ink)] text-[var(--color-ink-inverse)]',
  success: 'bg-[var(--color-success-soft)] text-[var(--color-success)]',
  warning: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
  danger: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
  accent: 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]',
  outline:
    'border border-[var(--color-line-strong)] text-[var(--color-ink-muted)] bg-transparent',
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode
  tone?: Tone
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
        'text-[11px] font-medium leading-[18px] whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Human labels for the condition enum - used in cards, detail, and filters. */
export const CONDITION_LABELS: Record<string, string> = {
  NEW: 'New',
  LIKE_NEW: 'Like new',
  GOOD: 'Good',
  FAIR: 'Fair',
  WELL_USED: 'Well used',
}

export const ROLE_LABELS: Record<string, string> = {
  HOSTELLER: 'Hosteller',
  DAY_SCHOLAR: 'Day scholar',
  OTHER: 'Other',
}

export function ConditionBadge({ condition }: { condition: string }) {
  return <Badge tone="outline">{CONDITION_LABELS[condition] ?? condition}</Badge>
}

/** Only renders for states worth calling out; ACTIVE listings show nothing. */
export function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'SOLD':
      return <Badge tone="solid">Sold</Badge>
    case 'RESERVED':
      return <Badge tone="warning">Reserved</Badge>
    case 'DRAFT':
      return <Badge tone="neutral">Draft</Badge>
    case 'PENDING_APPROVAL':
      return <Badge tone="warning">In review</Badge>
    case 'HIDDEN':
      return <Badge tone="neutral">Hidden</Badge>
    case 'REMOVED':
      return <Badge tone="danger">Removed</Badge>
    default:
      return null
  }
}

/** Unread count for nav items. Caps at 99+ so the pill never grows. */
export function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null

  return (
    <span
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1',
        'bg-[var(--color-danger)] text-white text-[10px] font-semibold leading-none',
      )}
      aria-label={`${count} unread`}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}
