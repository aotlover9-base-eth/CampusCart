'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { api, ApiError } from '@/lib/client/fetcher'
import { cn, formatPrice } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import {
  ArrowLeftIcon,
  ChatIcon,
  CheckIcon,
  ClockIcon,
  PhoneIcon,
  ShieldIcon,
} from '@/components/ui/icons'

/**
 * Phone-request flow, from the buyer's side.
 *
 * The number is never rendered from props — it is fetched on demand from
 * /api/user/[id]/phone, which re-checks the grant. That means a stale page
 * cannot leak a number the seller has since revoked.
 */

type RequestStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'AUTO_ACCEPTED' | 'EXPIRED' | 'REVOKED'

export function ContactPanel({
  listing,
  seller,
  request,
  canSeeNumber,
}: {
  listing: {
    id: string
    title: string
    priceInPaise: number
    isFree: boolean
    contactPreference: string
  }
  seller: {
    id: string
    fullName: string
    avatarUrl: string | null
    isVitVerified: boolean
    role: string
  }
  request: {
    id: string
    status: RequestStatus
    createdAt: string
    respondedAt: string | null
  } | null
  canSeeNumber: boolean
}) {
  const router = useRouter()
  const toast = useToast()

  const [status, setStatus] = useState<RequestStatus | null>(request?.status ?? null)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [phone, setPhone] = useState<string | null>(null)
  const [loadingPhone, setLoadingPhone] = useState(false)

  async function sendRequest() {
    setSubmitting(true)
    try {
      await api('/api/phone-requests', {
        method: 'POST',
        body: { listingId: listing.id, message: message.trim() || undefined },
      })
      setStatus('PENDING')
      toast.success('Request sent. You will be notified when they respond.')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not send that request.')
    } finally {
      setSubmitting(false)
    }
  }

  async function revealNumber() {
    setLoadingPhone(true)
    try {
      const result = await api<{ phone: string }>(
        `/api/user/${seller.id}/phone?listing=${listing.id}`,
      )
      setPhone(result.phone)
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'Could not load that number.',
      )
    } finally {
      setLoadingPhone(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-5 sm:py-8">
      <Link
        href={`/listing/${listing.id}`}
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        Back to listing
      </Link>

      <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
        <div className="flex items-center gap-3">
          <Avatar
            name={seller.fullName}
            src={seller.avatarUrl}
            size="lg"
            verified={seller.isVitVerified}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-[var(--color-ink)]">
              {seller.fullName}
            </p>
            <p className="truncate text-[13px] text-[var(--color-ink-muted)]">
              {listing.title} ·{' '}
              {listing.isFree ? 'Free' : formatPrice(listing.priceInPaise)}
            </p>
          </div>
        </div>

        <hr className="my-5 border-[var(--color-line)]" />

        {canSeeNumber ? (
          <Granted
            phone={phone}
            loading={loadingPhone}
            onReveal={() => void revealNumber()}
            sellerName={seller.fullName}
          />
        ) : status === 'PENDING' ? (
          <Pending />
        ) : status === 'REJECTED' ? (
          <Rejected listingId={listing.id} />
        ) : status === 'REVOKED' ? (
          <Revoked />
        ) : (
          <RequestForm
            message={message}
            onMessageChange={setMessage}
            submitting={submitting}
            onSubmit={() => void sendRequest()}
            contactPreference={listing.contactPreference}
          />
        )}
      </div>

      <p className="mt-4 flex items-start gap-2 text-[12.5px] leading-relaxed text-[var(--color-ink-subtle)]">
        <ShieldIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Numbers on CampusCart are private by default. Sellers approve each
        request individually, and can withdraw access at any time.
      </p>
    </div>
  )
}

function RequestForm({
  message,
  onMessageChange,
  submitting,
  onSubmit,
  contactPreference,
}: {
  message: string
  onMessageChange: (value: string) => void
  submitting: boolean
  onSubmit: () => void
  contactPreference: string
}) {
  return (
    <>
      <h1 className="text-[17px] font-semibold text-[var(--color-ink)]">
        Ask for their number
      </h1>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--color-ink-muted)]">
        {contactPreference === 'PHONE_ON_REQUEST'
          ? 'This seller is happy to be contacted directly. They still approve each request.'
          : 'This seller prefers to chat first. A short note about what you want helps.'}
      </p>

      <div className="mt-4">
        <Textarea
          label="Add a note (optional)"
          placeholder="Hi! Interested in this — can I call you this evening?"
          value={message}
          maxLength={300}
          onChange={(event) => onMessageChange(event.target.value)}
          className="min-h-[90px]"
        />
      </div>

      <Button className="mt-4" size="lg" fullWidth loading={submitting} onClick={onSubmit}>
        <PhoneIcon className="h-4 w-4" />
        Send request
      </Button>
    </>
  )
}

function Pending() {
  return (
    <div className="py-2 text-center">
      <motion.span
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 26 }}
        className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[var(--color-warning-soft)] text-[var(--color-warning)]"
      >
        <ClockIcon className="h-5 w-5" />
      </motion.span>

      <h1 className="mt-3.5 text-[16px] font-semibold text-[var(--color-ink)]">
        Waiting on the seller
      </h1>
      <p className="mx-auto mt-1.5 max-w-[36ch] text-[13.5px] leading-relaxed text-[var(--color-ink-muted)]">
        They will get a notification. You will be told as soon as they respond —
        no need to keep this page open.
      </p>
    </div>
  )
}

function Rejected({ listingId }: { listingId: string }) {
  return (
    <div className="py-2 text-center">
      <h1 className="text-[16px] font-semibold text-[var(--color-ink)]">
        They would rather chat here
      </h1>
      <p className="mx-auto mt-1.5 max-w-[36ch] text-[13.5px] leading-relaxed text-[var(--color-ink-muted)]">
        The seller declined to share their number. You can still message them in
        the app.
      </p>
      <Link href={`/listing/${listingId}`} className="mt-4 inline-block">
        <Button variant="secondary">
          <ChatIcon className="h-4 w-4" />
          Message instead
        </Button>
      </Link>
    </div>
  )
}

function Revoked() {
  return (
    <div className="py-2 text-center">
      <h1 className="text-[16px] font-semibold text-[var(--color-ink)]">
        No longer shared
      </h1>
      <p className="mx-auto mt-1.5 max-w-[36ch] text-[13.5px] leading-relaxed text-[var(--color-ink-muted)]">
        The seller has withdrawn access to their number.
      </p>
    </div>
  )
}

function Granted({
  phone,
  loading,
  onReveal,
  sellerName,
}: {
  phone: string | null
  loading: boolean
  onReveal: () => void
  sellerName: string
}) {
  return (
    <div className="text-center">
      <motion.span
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 26 }}
        className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[var(--color-success-soft)] text-[var(--color-success)]"
      >
        <CheckIcon className="h-5 w-5" />
      </motion.span>

      <h1 className="mt-3.5 text-[16px] font-semibold text-[var(--color-ink)]">
        {sellerName} shared their number
      </h1>

      {phone ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4"
        >
          <p className="font-mono text-[22px] font-semibold tracking-[0.01em] text-[var(--color-ink)]">
            {phone}
          </p>
          <div className="mt-4 flex gap-2">
            <a href={`tel:${phone}`} className="flex-1">
              <Button fullWidth>
                <PhoneIcon className="h-4 w-4" />
                Call
              </Button>
            </a>
            <a
              href={`https://wa.me/${phone.replace(/[^\d]/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1"
            >
              <Button variant="secondary" fullWidth>
                WhatsApp
              </Button>
            </a>
          </div>
        </motion.div>
      ) : (
        <>
          <p className="mx-auto mt-1.5 max-w-[34ch] text-[13.5px] leading-relaxed text-[var(--color-ink-muted)]">
            Keep it to this listing, and don't pass it on.
          </p>
          <Button className="mt-4" size="lg" fullWidth loading={loading} onClick={onReveal}>
            Show number
          </Button>
        </>
      )}

      <Badge tone="success" className={cn('mt-4', phone && 'mt-5')}>
        Approved by the seller
      </Badge>
    </div>
  )
}
