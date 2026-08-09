'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { api, ApiError } from '@/lib/client/fetcher'
import { cn, formatPrice } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet } from '@/components/ui/sheet'
import { useToast } from '@/components/ui/toast'
import { CheckIcon, TagIcon, XIcon } from '@/components/ui/icons'
import type { ChatMessage } from './types'

/**
 * An offer, rendered inside the conversation.
 *
 * Offers used to reach the seller only as a notification, which meant opening
 * the chat showed an empty bubble and the decision lived somewhere else. The
 * card puts the amount and the accept/decline/counter actions in the thread
 * where the negotiation is already happening.
 */
export function OfferCard({
  message,
  onResolved,
}: {
  message: ChatMessage
  /** Refresh the thread so the status pill and system message update. */
  onResolved?: () => void
}) {
  const toast = useToast()
  const offer = message.offer
  const [busy, setBusy] = useState(false)
  const [counterOpen, setCounterOpen] = useState(false)
  const [counterValue, setCounterValue] = useState('')

  // A malformed row shouldn't blank the thread - fall back to the note.
  if (!offer) {
    return (
      <p className="whitespace-pre-wrap break-words px-3.5 py-2">
        {message.body ?? 'Made an offer'}
      </p>
    )
  }

  const pending = offer.status === 'PENDING'
  // The buyer made it, so the seller is the one who decides.
  const canRespond = pending && !offer.isMine
  const canWithdraw = pending && offer.isMine

  const asking = offer.listing?.priceInPaise ?? 0
  const delta = asking > 0 ? Math.round(((asking - offer.amountInPaise) / asking) * 100) : 0

  async function act(action: 'accept' | 'reject' | 'counter' | 'withdraw', rupees?: number) {
    setBusy(true)
    try {
      await api(`/api/offers/${offer!.id}`, {
        method: 'POST',
        body: { action, ...(rupees ? { counterRupees: rupees } : {}) },
      })
      toast.success(
        {
          accept: 'Offer accepted - the item is reserved',
          reject: 'Offer declined',
          counter: 'Counter sent',
          withdraw: 'Offer withdrawn',
        }[action],
      )
      setCounterOpen(false)
      onResolved?.()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not respond to that offer.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className={cn('flex px-1 py-1.5', offer.isMine ? 'justify-end' : 'justify-start')}
      >
        <div
          className={cn(
            'w-[86%] max-w-[320px] overflow-hidden rounded-[var(--radius-lg)] border',
            pending
              ? 'border-[var(--color-line-strong)] bg-[var(--color-surface)]'
              : 'border-[var(--color-line)] bg-[var(--color-surface-sunken)]',
          )}
        >
          <div className="flex items-center gap-1.5 border-b border-[var(--color-line)] px-3.5 py-2">
            <TagIcon className="h-3.5 w-3.5 text-[var(--color-ink-muted)]" />
            <span className="text-[11.5px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
              {offer.isMine ? 'Your offer' : 'Offer received'}
            </span>
            <StatusPill status={offer.status} />
          </div>

          <div className="px-3.5 py-3">
            <p className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--color-ink)]">
              {formatPrice(offer.amountInPaise)}
            </p>

            {asking > 0 && offer.amountInPaise !== asking && (
              <p className="mt-0.5 text-[12px] text-[var(--color-ink-muted)]">
                {delta > 0 ? `${delta}% below` : `${Math.abs(delta)}% above`} the{' '}
                {formatPrice(asking)} asking price
              </p>
            )}

            {offer.counterAmountInPaise && (
              <p className="mt-1.5 text-[12.5px] text-[var(--color-ink)]">
                Countered at{' '}
                <span className="font-semibold">
                  {formatPrice(offer.counterAmountInPaise)}
                </span>
              </p>
            )}

            {message.body && (
              <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
                {message.body}
              </p>
            )}
          </div>

          {canRespond && (
            <div className="flex gap-1.5 border-t border-[var(--color-line)] p-2">
              <Button
                size="sm"
                className="flex-1"
                loading={busy}
                onClick={() => void act('accept')}
              >
                <CheckIcon className="h-3.5 w-3.5" />
                Accept
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setCounterValue(String(Math.round(asking / 100) || ''))
                  setCounterOpen(true)
                }}
              >
                Counter
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                aria-label="Decline offer"
                onClick={() => void act('reject')}
              >
                <XIcon className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {canWithdraw && (
            <div className="border-t border-[var(--color-line)] p-2">
              <Button
                size="sm"
                variant="ghost"
                fullWidth
                loading={busy}
                onClick={() => void act('withdraw')}
              >
                Withdraw offer
              </Button>
            </div>
          )}
        </div>
      </motion.div>

      <Sheet
        open={counterOpen}
        onClose={() => setCounterOpen(false)}
        title="Counter this offer"
        description={`They offered ${formatPrice(offer.amountInPaise)}.`}
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setCounterOpen(false)}>
              Cancel
            </Button>
            <Button
              fullWidth
              loading={busy}
              disabled={!Number(counterValue)}
              onClick={() => void act('counter', Number(counterValue))}
            >
              Send counter
            </Button>
          </div>
        }
      >
        <div className="pt-1">
          <Input
            type="number"
            inputMode="numeric"
            label="Your price"
            prefix="₹"
            min={1}
            value={counterValue}
            onChange={(event) => setCounterValue(event.target.value)}
            autoFocus
          />
        </div>
      </Sheet>
    </>
  )
}

function StatusPill({ status }: { status: string }) {
  if (status === 'PENDING') return null

  const tone: Record<string, string> = {
    ACCEPTED: 'text-[var(--color-success)]',
    REJECTED: 'text-[var(--color-danger)]',
    COUNTERED: 'text-[var(--color-warning)]',
    WITHDRAWN: 'text-[var(--color-ink-subtle)]',
    EXPIRED: 'text-[var(--color-ink-subtle)]',
  }

  return (
    <span className={cn('ml-auto text-[11px] font-semibold capitalize', tone[status])}>
      {status.toLowerCase()}
    </span>
  )
}
