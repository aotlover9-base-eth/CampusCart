'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, ApiError } from '@/lib/client/fetcher'
import { formatPrice } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Sheet } from '@/components/ui/sheet'
import { useToast } from '@/components/ui/toast'

/**
 * Make-an-offer sheet.
 *
 * An accepted offer reserves the listing, so this deliberately shows how far
 * below asking the number is - a lowball should feel like a choice, not a slip.
 * On success the buyer lands in the thread the offer created.
 */
export function OfferSheet({
  open,
  onClose,
  listing,
}: {
  open: boolean
  onClose: () => void
  listing: { id: string; title: string; priceInPaise: number }
}) {
  const router = useRouter()
  const toast = useToast()

  const [value, setValue] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const asking = Math.round(listing.priceInPaise / 100)

  useEffect(() => {
    // Reset each time it opens so a previous draft never leaks into a new offer.
    if (open) {
      setValue('')
      setMessage('')
    }
  }, [open])

  const amount = Number(value)
  const valid = Number.isFinite(amount) && amount > 0 && amount <= 1_000_000
  const percentOff = valid && asking > 0 ? Math.round(((asking - amount) / asking) * 100) : 0

  async function submit() {
    setSubmitting(true)
    try {
      const result = await api<{ conversationId: string }>('/api/offers', {
        method: 'POST',
        body: {
          listingId: listing.id,
          amountRupees: amount,
          message: message.trim() || undefined,
        },
      })
      toast.success('Offer sent')
      onClose()
      router.push(`/chats/${result.conversationId}`)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not send that offer.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Make an offer"
      description={`Asking ${formatPrice(listing.priceInPaise)} for "${listing.title}".`}
      size="sm"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" fullWidth onClick={onClose}>
            Cancel
          </Button>
          <Button fullWidth loading={submitting} disabled={!valid} onClick={() => void submit()}>
            Send offer
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        <Input
          type="number"
          inputMode="numeric"
          label="Your offer"
          prefix="₹"
          min={1}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          hint={
            valid && percentOff > 0
              ? `${percentOff}% below asking`
              : valid && percentOff < 0
                ? 'Above the asking price'
                : undefined
          }
          autoFocus
        />

        <div className="flex gap-2">
          {[0.9, 0.8, 0.7].map((factor) => {
            const suggestion = Math.max(1, Math.round((asking * factor) / 10) * 10)
            return (
              <button
                key={factor}
                type="button"
                onClick={() => setValue(String(suggestion))}
                className="flex-1 rounded-[var(--radius-sm)] border border-[var(--color-line)] px-2 py-1.5 text-[12.5px] font-medium text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-line-strong)] hover:text-[var(--color-ink)]"
              >
                ₹{suggestion.toLocaleString('en-IN')}
              </button>
            )
          })}
        </div>

        <Textarea
          label="Note (optional)"
          placeholder="Can collect today from your block."
          value={message}
          maxLength={500}
          onChange={(event) => setMessage(event.target.value)}
          className="min-h-[80px]"
        />
      </div>
    </Sheet>
  )
}
