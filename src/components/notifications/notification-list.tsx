'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { api } from '@/lib/client/fetcher'
import { useRealtime, type RealtimeEvent } from '@/lib/client/use-realtime'
import { useInfiniteScroll } from '@/lib/client/use-in-view'
import { cn, timeAgo } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ConversationRowSkeleton } from '@/components/ui/skeleton'
import {
  BellIcon,
  CheckIcon,
  FlagIcon,
  HeartIcon,
  ChatIcon,
  PhoneIcon,
  TagIcon,
  ShieldIcon,
} from '@/components/ui/icons'

/**
 * Notification feed.
 *
 * New notifications arrive over the same SSE stream as chat, so the list stays
 * current while it is open. Opening one marks it read; there is also a
 * mark-all-read for clearing a backlog.
 */

interface Notification {
  id: string
  kind: string
  title: string
  body: string | null
  href: string | null
  entityType: string | null
  entityId: string | null
  readAt: string | null
  createdAt: string
}

interface Page {
  notifications: Notification[]
  unreadCount: number
  nextCursor: string | null
  hasMore: boolean
}

export function NotificationList() {
  const router = useRouter()
  const [items, setItems] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (nextCursor: string | null) => {
    setLoading(true)
    setError(null)

    try {
      const data = await api<Page>(
        `/api/notifications${nextCursor ? `?cursor=${nextCursor}` : ''}`,
      )
      setItems((current) => (nextCursor ? [...current, ...data.notifications] : data.notifications))
      setUnread(data.unreadCount)
      setCursor(data.nextCursor)
      setHasMore(data.hasMore)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load notifications')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(null)
  }, [load])

  const handleEvent = useCallback((event: RealtimeEvent) => {
    if (event.type !== 'notification') return
    const incoming = event.notification as Notification
    setItems((current) =>
      current.some((item) => item.id === incoming.id) ? current : [incoming, ...current],
    )
    setUnread((count) => count + 1)
  }, [])

  useRealtime(handleEvent)

  const sentinelRef = useInfiniteScroll(
    () => {
      if (cursor) void load(cursor)
    },
    { hasMore: hasMore && !error, loading },
  )

  async function markAllRead() {
    // Optimistic: the badge should clear the instant it is tapped.
    const now = new Date().toISOString()
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? now })))
    setUnread(0)

    try {
      await api('/api/notifications', { method: 'PATCH', body: { all: true } })
      router.refresh()
    } catch {
      void load(null)
    }
  }

  async function open(item: Notification) {
    if (!item.readAt) {
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry,
        ),
      )
      setUnread((count) => Math.max(0, count - 1))
      void api('/api/notifications', { method: 'PATCH', body: { ids: [item.id] } }).catch(() => {})
    }
    if (item.href) router.push(item.href)
  }

  if (loading && items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-5 sm:py-7">
        {Array.from({ length: 6 }, (_, index) => (
          <ConversationRowSkeleton key={index} />
        ))}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-5 sm:py-7">
      <header className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--color-ink)]">
          Notifications
          {unread > 0 && (
            <span className="ml-2 align-middle text-[13px] font-medium text-[var(--color-ink-muted)]">
              {unread} new
            </span>
          )}
        </h1>

        {unread > 0 && (
          <Button variant="ghost" size="sm" onClick={() => void markAllRead()}>
            Mark all read
          </Button>
        )}
      </header>

      {items.length === 0 ? (
        <EmptyState
          illustration="notification"
          title="Nothing yet"
          description="Messages and offers show up here."
        />
      ) : (
        <ul className="space-y-1">
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <motion.li
                key={item.id}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 460, damping: 34 }}
              >
                <Row item={item} onOpen={() => void open(item)} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <div ref={sentinelRef} aria-hidden className="h-px" />

      {loading && items.length > 0 && (
        <div className="py-2">
          <ConversationRowSkeleton />
        </div>
      )}

      {error && items.length > 0 && (
        <div className="py-6 text-center">
          <p className="mb-3 text-[13px] text-[var(--color-ink-muted)]">{error}</p>
          <Button variant="secondary" size="sm" onClick={() => cursor && void load(cursor)}>
            Retry
          </Button>
        </div>
      )}
    </div>
  )
}

function Row({ item, onOpen }: { item: Notification; onOpen: () => void }) {
  const unread = !item.readAt
  const content = (
    <>
      <span
        className={cn(
          'mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full',
          unread
            ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
            : 'bg-[var(--color-surface-sunken)] text-[var(--color-ink-muted)]',
        )}
      >
        <KindIcon kind={item.kind} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span
            className={cn(
              'truncate text-[14px] text-[var(--color-ink)]',
              unread ? 'font-semibold' : 'font-medium',
            )}
          >
            {item.title}
          </span>
          <time
            dateTime={item.createdAt}
            className="shrink-0 text-[11.5px] text-[var(--color-ink-subtle)]"
          >
            {timeAgo(item.createdAt)}
          </time>
        </span>

        {item.body && (
          <span className="mt-0.5 line-clamp-2 block text-[13px] text-[var(--color-ink-muted)]">
            {item.body}
          </span>
        )}
      </span>

      {unread && (
        <span
          aria-label="Unread"
          className="mt-3 h-2 w-2 shrink-0 rounded-full bg-[var(--color-accent)]"
        />
      )}
    </>
  )

  const className = cn(
    'flex w-full items-start gap-3 rounded-[var(--radius-md)] px-3 py-3 text-left transition-colors',
    unread ? 'bg-[var(--color-surface-sunken)]' : 'hover:bg-[var(--color-surface-hover)]',
  )

  // A notification with a destination is a link, so it keeps middle-click and
  // open-in-new-tab. One without is just a button.
  return item.href ? (
    <Link href={item.href} onClick={onOpen} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onOpen} className={className}>
      {content}
    </button>
  )
}

function KindIcon({ kind }: { kind: string }) {
  const className = 'h-4 w-4'

  switch (kind) {
    case 'NEW_MESSAGE':
      return <ChatIcon className={className} />
    case 'LISTING_LIKED':
      return <HeartIcon className={className} />
    case 'OFFER_RECEIVED':
    case 'OFFER_ACCEPTED':
    case 'OFFER_REJECTED':
      return <TagIcon className={className} />
    case 'PHONE_REQUEST_RECEIVED':
    case 'PHONE_REQUEST_ACCEPTED':
    case 'PHONE_REQUEST_REJECTED':
      return <PhoneIcon className={className} />
    case 'LISTING_SOLD':
    case 'LISTING_APPROVED':
    case 'ACCOUNT_VERIFIED':
      return <CheckIcon className={className} />
    case 'LISTING_REPORTED':
    case 'LISTING_REMOVED':
      return <FlagIcon className={className} />
    case 'ANNOUNCEMENT':
      return <ShieldIcon className={className} />
    default:
      return <BellIcon className={className} />
  }
}
