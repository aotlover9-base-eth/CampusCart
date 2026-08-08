import { cn } from '@/lib/utils'

/**
 * Shimmer placeholders. Shapes mirror the real components closely enough that
 * content swapping in doesn't shift layout.
 *
 * The shimmer animation is defined in globals.css and is disabled under
 * prefers-reduced-motion, where these fall back to a static tint.
 */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('skeleton rounded-[var(--radius-sm)]', className)}
    />
  )
}

/** Matches ListingCard: 4:3 media, two text lines, a price row. */
export function ListingCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)]">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="space-y-2.5 p-3">
        <Skeleton className="h-3.5 w-4/5" />
        <Skeleton className="h-3 w-2/5" />
        <div className="flex items-center gap-2 pt-1">
          <Skeleton className="h-6 w-6 rounded-full" />
          <Skeleton className="h-2.5 w-24" />
        </div>
      </div>
    </div>
  )
}

/** `count` defaults to a full first screen on desktop. */
export function FeedSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <ListingCardSkeleton key={index} />
      ))}
    </div>
  )
}

export function ConversationRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-3.5 w-1/3" />
        <Skeleton className="h-3 w-3/5" />
      </div>
      <Skeleton className="h-10 w-10 shrink-0 rounded-[var(--radius-sm)]" />
    </div>
  )
}

export function ChatBubbleSkeleton({ mine }: { mine?: boolean }) {
  return (
    <div className={cn('flex px-4 py-1', mine ? 'justify-end' : 'justify-start')}>
      <Skeleton
        className={cn('h-9 rounded-[var(--radius-lg)]', mine ? 'w-40' : 'w-52')}
      />
    </div>
  )
}

export function ListingDetailSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
      <div className="space-y-4">
        <Skeleton className="aspect-[4/3] w-full rounded-[var(--radius-lg)]" />
        <div className="flex gap-2">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-16 w-16 rounded-[var(--radius-sm)]" />
          ))}
        </div>
      </div>
      <div className="mt-6 space-y-4 lg:mt-0">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-11 w-full rounded-[var(--radius-md)]" />
      </div>
    </div>
  )
}

export function ProfileHeaderSkeleton() {
  return (
    <div className="flex items-center gap-4 px-4 py-6">
      <Skeleton className="h-24 w-24 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2.5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-56" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  )
}
