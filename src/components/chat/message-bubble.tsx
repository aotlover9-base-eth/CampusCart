'use client'

import { useState } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { CheckIcon, WarningIcon } from '@/components/ui/icons'
import { OfferCard } from './offer-card'
import type { ChatMessage } from './types'

/**
 * One message.
 *
 * SYSTEM messages render as a centred pill rather than a bubble — they are
 * events (offer accepted, number shared), not something anyone said.
 */
export function MessageBubble({
  message,
  showTail,
  onOfferResolved,
}: {
  message: ChatMessage
  /** Last in a run from the same sender; only that one gets a timestamp. */
  showTail: boolean
  /** Reloads the thread after an offer is accepted, declined, or countered. */
  onOfferResolved?: () => void
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false)

  // Offers get an actionable card rather than a bubble — the seller decides
  // here instead of being sent off to another screen.
  if (message.kind === 'OFFER') {
    return <OfferCard message={message} onResolved={onOfferResolved} />
  }

  if (message.kind === 'SYSTEM') {
    return (
      <div className="flex justify-center py-1.5">
        <span className="rounded-full bg-[var(--color-surface-sunken)] px-3 py-1 text-[11.5px] text-[var(--color-ink-muted)]">
          {message.body}
        </span>
      </div>
    )
  }

  const mine = message.isMine
  const time = new Date(message.createdAt).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className={cn('flex', mine ? 'justify-end' : 'justify-start')}
      >
        <div
          className={cn(
            'max-w-[78%] sm:max-w-[68%]',
            message.pending && 'opacity-60',
            message.failed && 'opacity-70',
          )}
        >
          <div
            className={cn(
              'overflow-hidden rounded-[var(--radius-lg)] text-[14.5px] leading-relaxed',
              mine
                ? 'bg-[var(--color-ink)] text-[var(--color-ink-inverse)]'
                : 'bg-[var(--color-surface-sunken)] text-[var(--color-ink)]',
              // Flatten the corner nearest the sender for a subtle tail.
              showTail && (mine ? 'rounded-br-[6px]' : 'rounded-bl-[6px]'),
            )}
          >
            {message.isDeleted ? (
              <p className="px-3.5 py-2 italic opacity-60">Message deleted</p>
            ) : (
              <>
                {message.media && (
                  <button
                    type="button"
                    onClick={() => setLightboxOpen(true)}
                    className="block w-full cursor-zoom-in"
                    aria-label="Open image"
                  >
                    <Image
                      src={message.media.thumbnailUrl}
                      alt=""
                      width={message.media.width ?? 600}
                      height={message.media.height ?? 400}
                      placeholder={message.media.blurDataUrl ? 'blur' : 'empty'}
                      blurDataURL={message.media.blurDataUrl ?? undefined}
                      className="h-auto w-full max-w-[280px] object-cover"
                    />
                  </button>
                )}
                {message.body && (
                  <p className="whitespace-pre-wrap break-words px-3.5 py-2">
                    {message.body}
                  </p>
                )}
              </>
            )}
          </div>

          {showTail && (
            <div
              className={cn(
                'mt-1 flex items-center gap-1 px-1 text-[11px] text-[var(--color-ink-subtle)]',
                mine ? 'justify-end' : 'justify-start',
              )}
            >
              {message.failed ? (
                <span className="flex items-center gap-1 text-[var(--color-danger)]">
                  <WarningIcon className="h-3 w-3" />
                  Not sent
                </span>
              ) : (
                <>
                  <time dateTime={String(message.createdAt)}>{time}</time>
                  {mine && !message.pending && <ReadReceipt read={Boolean(message.readAt)} />}
                </>
              )}
            </div>
          )}
        </div>
      </motion.div>

      {lightboxOpen && message.media && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Image"
          onClick={() => setLightboxOpen(false)}
          className="fixed inset-0 z-[var(--z-lightbox)] grid place-items-center bg-black/92 p-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- full-resolution original */}
          <img
            src={message.media.url}
            alt=""
            className="max-h-[90vh] max-w-[92vw] object-contain"
          />
        </div>
      )}
    </>
  )
}

/** Two ticks, filled once the other participant has read the message. */
function ReadReceipt({ read }: { read: boolean }) {
  return (
    <span
      className={cn('relative inline-flex', read && 'text-[var(--color-accent)]')}
      aria-label={read ? 'Read' : 'Sent'}
    >
      <CheckIcon className="h-3 w-3" />
      <CheckIcon className={cn('-ml-[5px] h-3 w-3', !read && 'opacity-0')} />
    </span>
  )
}
