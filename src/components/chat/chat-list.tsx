'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { AnimatePresence, motion } from 'framer-motion'
import type { SerializedConversation } from '@/lib/conversations'
import { api, queryString } from '@/lib/client/fetcher'
import { useRealtime } from '@/lib/client/use-realtime'
import { cn, formatPrice, timeAgo } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { ConversationRowSkeleton } from '@/components/ui/skeleton'
import { SearchIcon, XIcon } from '@/components/ui/icons'

/**
 * Conversation list.
 *
 * Refetches on any realtime `conversation-updated` event, which is cheap (one
 * indexed query) and keeps ordering, previews, and unread counts consistent with
 * the server rather than trying to patch them locally.
 */
export function ChatList() {
  const [conversations, setConversations] = useState<SerializedConversation[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const load = useCallback(async () => {
    try {
      const result = await api<{ conversations: SerializedConversation[] }>(
        `/api/conversations${queryString({
          ...(query.trim() ? { q: query.trim() } : {}),
          ...(showArchived ? { archived: true } : {}),
        })}`,
      )
      setConversations(result.conversations)
    } catch {
      setConversations([])
    } finally {
      setLoading(false)
    }
  }, [query, showArchived])

  // Debounced so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), query ? 220 : 0)
    return () => window.clearTimeout(timer)
  }, [load, query])

  useRealtime(
    useCallback(
      (event) => {
        if (event.type === 'conversation-updated') void load()
      },
      [load],
    ),
  )

  return (
    <div className="mx-auto max-w-2xl px-4 py-5 sm:py-7">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--color-ink)] sm:text-[26px]">
          Chats
        </h1>
        <button
          type="button"
          onClick={() => setShowArchived((value) => !value)}
          className={cn(
            'rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors',
            showArchived
              ? 'border-[var(--color-ink)] text-[var(--color-ink)]'
              : 'border-[var(--color-line)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]',
          )}
        >
          {showArchived ? 'Archived' : 'Show archived'}
        </button>
      </header>

      <div className="relative mb-4">
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-subtle)]" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by item or person"
          aria-label="Search conversations"
          className={cn(
            'h-10 w-full rounded-[10px] border pl-10 pr-9 text-[14px]',
            'border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[var(--color-ink)]',
            'placeholder:text-[var(--color-ink-subtle)] focus:border-[var(--color-ink)] focus:outline-none',
            '[&::-webkit-search-cancel-button]:appearance-none',
          )}
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-subtle)] hover:text-[var(--color-ink)]"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="divide-y divide-[var(--color-line)]">
          {Array.from({ length: 5 }, (_, index) => (
            <ConversationRowSkeleton key={index} />
          ))}
        </div>
      ) : conversations.length === 0 ? (
        <EmptyState
          illustration="chat"
          title={
            query
              ? 'No conversations match'
              : showArchived
                ? 'Nothing archived'
                : 'No chats yet'
          }
          description={
            query
              ? 'Try a different name or item.'
              : 'Message a seller from any listing and the thread shows up here.'
          }
          action={
            !query && !showArchived ? (
              <Link href="/home">
                <Button>Browse listings</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-[var(--color-line)]">
          <AnimatePresence initial={false}>
            {conversations.map((conversation) => (
              <motion.li
                key={conversation.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <ConversationRow conversation={conversation} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}

function ConversationRow({ conversation }: { conversation: SerializedConversation }) {
  const unread = conversation.unreadCount > 0

  return (
    <Link
      href={`/chats/${conversation.id}`}
      className={cn(
        'flex items-center gap-3 py-3 transition-colors',
        'hover:bg-[var(--color-surface-hover)]',
      )}
    >
      <Avatar
        name={conversation.other.fullName}
        src={conversation.other.avatarUrl}
        size="lg"
        verified={conversation.other.isVitVerified}
        online={conversation.other.isOnline}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p
            className={cn(
              'truncate text-[14.5px] text-[var(--color-ink)]',
              unread ? 'font-semibold' : 'font-medium',
            )}
          >
            {conversation.other.fullName}
          </p>
          <time className="shrink-0 text-[11.5px] text-[var(--color-ink-subtle)]">
            {timeAgo(conversation.lastMessageAt)}
          </time>
        </div>

        {conversation.listing && (
          <p className="truncate text-[12px] text-[var(--color-ink-subtle)]">
            {conversation.listing.title}
            {' · '}
            {conversation.listing.isFree
              ? 'Free'
              : formatPrice(conversation.listing.priceInPaise, { compact: true })}
          </p>
        )}

        <p
          className={cn(
            'mt-0.5 truncate text-[13px]',
            unread ? 'font-medium text-[var(--color-ink)]' : 'text-[var(--color-ink-muted)]',
          )}
        >
          {conversation.lastMessagePreview ?? 'No messages yet'}
        </p>
      </div>

      {conversation.listing?.thumbnailUrl ? (
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-surface-sunken)]">
          <Image
            src={conversation.listing.thumbnailUrl}
            alt=""
            fill
            sizes="44px"
            className="object-cover"
          />
        </div>
      ) : null}

      {unread && (
        <span
          className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[10px] font-semibold text-white"
          aria-label={`${conversation.unreadCount} unread`}
        >
          {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
        </span>
      )}
    </Link>
  )
}
