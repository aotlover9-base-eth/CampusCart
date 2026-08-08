'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import type { SerializedConversation } from '@/lib/conversations'
import type { ChatMessage } from './types'
import { api } from '@/lib/client/fetcher'
import { useRealtime, type RealtimeEvent } from '@/lib/client/use-realtime'
import { formatPrice } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ChevronLeftIcon, MoreIcon } from '@/components/ui/icons'
import { MessageBubble } from './message-bubble'
import { MessageComposer } from './message-composer'
import { ThreadMenu } from './thread-menu'

/**
 * A single conversation.
 *
 * Sends are optimistic: the bubble appears immediately with a temporary id and
 * is reconciled when the server responds. On failure it is marked failed rather
 * than silently removed, so the text is never lost.
 */
export function ChatThread({
  conversation,
  initialMessages,
  initialCursor,
  hasMoreInitially,
  viewerId,
  blocked,
}: {
  conversation: SerializedConversation
  initialMessages: ChatMessage[]
  initialCursor: string | null
  hasMoreInitially: boolean
  viewerId: string
  blocked: { byMe: boolean } | null
}) {
  const router = useRouter()
  const [messages, setMessages] = useState(initialMessages)
  const [cursor, setCursor] = useState(initialCursor)
  const [hasMore, setHasMore] = useState(hasMoreInitially)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [otherTyping, setOtherTyping] = useState(false)
  const online = conversation.other.isOnline
  const [menuOpen, setMenuOpen] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const typingTimer = useRef<number>(0)

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' })
  }, [])

  useEffect(() => {
    scrollToBottom('instant')
  }, [scrollToBottom])

  const handleEvent = useCallback(
    (event: RealtimeEvent) => {
      if (event.type === 'message') {
        const incoming = event.message as ChatMessage
        if (incoming.conversationId !== conversation.id) return

        setMessages((current) => {
          if (current.some((m) => m.id === incoming.id)) return current
          // Replace our optimistic copy if this is the echo of our own send.
          const pendingIndex = current.findIndex(
            (m) => m.pending && m.isMine && m.body === incoming.body,
          )
          if (pendingIndex !== -1) {
            const next = [...current]
            next[pendingIndex] = incoming
            return next
          }
          return [...current, incoming]
        })

        setOtherTyping(false)

        // Reading it as it arrives keeps the badge from flashing on.
        if (!incoming.isMine) {
          void api(`/api/conversations/${conversation.id}`, {
            method: 'PATCH',
            body: { markRead: true },
          }).catch(() => {})
        }

        // Only auto-scroll when the user is already near the bottom, so reading
        // history isn't interrupted.
        const container = scrollRef.current
        const nearBottom =
          !container ||
          container.scrollHeight - container.scrollTop - container.clientHeight < 220
        if (nearBottom || incoming.isMine) requestAnimationFrame(() => scrollToBottom())
      }

      if (event.type === 'typing' && event.userId !== viewerId) {
        setOtherTyping(Boolean(event.typing))
        window.clearTimeout(typingTimer.current)
        if (event.typing) {
          // Safety net: a dropped stop-frame shouldn't leave the dots forever.
          typingTimer.current = window.setTimeout(() => setOtherTyping(false), 6000)
        }
      }

      if (event.type === 'read' && event.readerId !== viewerId) {
        setMessages((current) =>
          current.map((message) =>
            message.isMine && !message.readAt
              ? { ...message, readAt: String(event.readAt), deliveryState: 'READ' }
              : message,
          ),
        )
      }


      if (event.type === 'message-deleted') {
        setMessages((current) =>
          current.map((message) =>
            message.id === event.messageId
              ? { ...message, deletedAt: new Date().toISOString(), body: null }
              : message,
          ),
        )
      }
    },
    [conversation.id, conversation.other.id, scrollToBottom, viewerId],
  )

  useRealtime(handleEvent, { conversationId: conversation.id })

  /**
   * Refetch the newest page after an offer is resolved: the offer row changed
   * status and the server appended a SYSTEM message, and neither arrives over
   * the realtime channel as an update to an existing bubble.
   */
  const reloadThread = useCallback(async () => {
    try {
      const result = await api<{
        messages: ChatMessage[]
        nextCursor: string | null
        hasMore: boolean
      }>(`/api/conversations/${conversation.id}/messages`)

      setMessages(result.messages)
      setCursor(result.nextCursor)
      setHasMore(result.hasMore)
      requestAnimationFrame(() => scrollToBottom())
    } catch {
      // Leave the thread as-is; the toast already reported the outcome.
    }
    router.refresh()
  }, [conversation.id, router, scrollToBottom])

  async function loadOlder() {
    if (!cursor || loadingOlder) return
    setLoadingOlder(true)

    const container = scrollRef.current
    const previousHeight = container?.scrollHeight ?? 0

    try {
      const result = await api<{
        messages: ChatMessage[]
        nextCursor: string | null
        hasMore: boolean
      }>(`/api/conversations/${conversation.id}/messages?cursor=${cursor}`)

      setMessages((current) => [...result.messages, ...current])
      setCursor(result.nextCursor)
      setHasMore(result.hasMore)

      // Hold the reading position steady as content is prepended above it.
      requestAnimationFrame(() => {
        if (container) container.scrollTop = container.scrollHeight - previousHeight
      })
    } catch {
      setHasMore(false)
    } finally {
      setLoadingOlder(false)
    }
  }

  const handleSent = useCallback(
    (optimistic: ChatMessage) => {
      setMessages((current) => [...current, optimistic])
      requestAnimationFrame(() => scrollToBottom())
    },
    [scrollToBottom],
  )

  const handleSettled = useCallback(
    (tempId: string, settled: ChatMessage | null) => {
      setMessages((current) =>
        settled
          ? current.map((message) => (message.id === tempId ? settled : message))
          : current.map((message) =>
              message.id === tempId ? { ...message, failed: true, pending: false } : message,
            ),
      )
    },
    [],
  )

  const listing = conversation.listing
  const groups = useMemo(() => groupByDay(messages), [messages])

  return (
    <div className="flex h-[calc(100dvh-var(--nav-height))] flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--color-line)] bg-[var(--color-surface)]/85 px-3 py-2.5 backdrop-blur-xl">
        <button
          type="button"
          onClick={() => router.push('/chats')}
          aria-label="Back to chats"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)] sm:hidden"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>

        <Link
          href={`/u/${conversation.other.id}`}
          className="flex min-w-0 flex-1 items-center gap-2.5"
        >
          <Avatar
            name={conversation.other.fullName}
            src={conversation.other.avatarUrl}
            size="sm"
            verified={conversation.other.isVitVerified}
            online={online}
          />
          <span className="min-w-0">
            <span className="block truncate text-[14.5px] font-semibold text-[var(--color-ink)]">
              {conversation.other.fullName}
            </span>
            <span className="block text-[11.5px] text-[var(--color-ink-subtle)]">
              {otherTyping ? 'typing…' : online ? 'Online' : 'Offline'}
            </span>
          </span>
        </Link>

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            aria-label="Conversation options"
            aria-expanded={menuOpen}
            className="grid h-9 w-9 place-items-center rounded-full text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)]"
          >
            <MoreIcon className="h-4.5 w-4.5" />
          </button>
          <ThreadMenu
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            conversation={conversation}
            blockedByMe={blocked?.byMe ?? false}
          />
        </div>
      </header>

      {listing && (
        <Link
          href={`/listing/${listing.id}`}
          className="flex shrink-0 items-center gap-3 border-b border-[var(--color-line)] bg-[var(--color-surface-sunken)] px-3 py-2 transition-colors hover:bg-[var(--color-surface-hover)]"
        >
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-surface)]">
            {listing.thumbnailUrl && (
              <Image
                src={listing.thumbnailUrl}
                alt=""
                fill
                sizes="40px"
                className="object-cover"
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-[var(--color-ink)]">
              {listing.title}
            </p>
            <p className="text-[12px] text-[var(--color-ink-muted)]">
              {listing.isFree ? 'Free' : formatPrice(listing.priceInPaise)}
              {listing.status !== 'ACTIVE' && ` · ${listing.status.toLowerCase()}`}
            </p>
          </div>
        </Link>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {hasMore && (
          <div className="mb-4 text-center">
            <Button
              variant="ghost"
              size="sm"
              loading={loadingOlder}
              onClick={() => void loadOlder()}
            >
              Load earlier messages
            </Button>
          </div>
        )}

        {groups.map((group) => (
          <section key={group.label}>
            <div className="sticky top-0 z-[1] flex justify-center py-2">
              <span className="rounded-full bg-[var(--color-surface-sunken)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-ink-subtle)]">
                {group.label}
              </span>
            </div>
            <div className="space-y-1.5">
              {group.messages.map((message, index) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onOfferResolved={() => void reloadThread()}
                  showTail={
                    index === group.messages.length - 1 ||
                    group.messages[index + 1]?.isMine !== message.isMine
                  }
                />
              ))}
            </div>
          </section>
        ))}

        <AnimatePresence>
          {otherTyping && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="mt-2 flex items-center gap-1.5 pl-1"
            >
              {[0, 1, 2].map((dot) => (
                <motion.span
                  key={dot}
                  animate={{ opacity: [0.25, 1, 0.25] }}
                  transition={{ duration: 1.1, repeat: Infinity, delay: dot * 0.16 }}
                  className="h-1.5 w-1.5 rounded-full bg-[var(--color-ink-subtle)]"
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={bottomRef} className="h-px" />
      </div>

      {blocked ? (
        <div className="shrink-0 border-t border-[var(--color-line)] px-4 py-5 text-center">
          <p className="text-[13px] text-[var(--color-ink-muted)]">
            {blocked.byMe
              ? 'You blocked this person. Unblock them to continue.'
              : 'You can no longer reply to this conversation.'}
          </p>
        </div>
      ) : (
        <MessageComposer
          conversationId={conversation.id}
          viewerId={viewerId}
          onOptimistic={handleSent}
          onSettled={handleSettled}
        />
      )}
    </div>
  )
}

interface DayGroup {
  label: string
  messages: ChatMessage[]
}

/** Date separators, so a long thread stays readable. */
function groupByDay(messages: ChatMessage[]): DayGroup[] {
  const groups: DayGroup[] = []

  for (const message of messages) {
    const label = dayLabel(new Date(message.createdAt))
    const last = groups.at(-1)
    if (last?.label === label) last.messages.push(message)
    else groups.push({ label, messages: [message] })
  }

  return groups
}

function dayLabel(date: Date): string {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

  if (sameDay(date, today)) return 'Today'
  if (sameDay(date, yesterday)) return 'Yesterday'

  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }),
  })
}
