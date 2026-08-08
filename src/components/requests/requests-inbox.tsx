'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { api, ApiError } from '@/lib/client/fetcher'
import { cn, formatPrice, timeAgo } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { Badge, ROLE_LABELS } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Sheet } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { ConversationRowSkeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { CheckIcon, PhoneIcon, XIcon } from '@/components/ui/icons'

/**
 * Offers and phone requests awaiting the seller's decision.
 *
 * Answered items stay visible but move below the pending ones, so a seller can
 * see what they already agreed to without it competing for attention.
 */

interface Offer {
  id: string
  amountInPaise: number
  counterAmountInPaise: number | null
  message: string | null
  status: string
  createdAt: string
  conversationId: string | null
  listing: { id: string; title: string; priceInPaise: number; isFree: boolean; status: string }
  buyer: { id: string; fullName: string; avatarUrl: string | null; isVitVerified: boolean }
}

interface PhoneRequest {
  id: string
  status: string
  message: string | null
  createdAt: string
  listing: { id: string; title: string }
  buyer: {
    id: string
    fullName: string
    avatarUrl: string | null
    isVitVerified: boolean
    role: string
    department: string | null
  }
}

type Tab = 'offers' | 'phone'

export function RequestsInbox() {
  const router = useRouter()
  const toast = useToast()

  const [tab, setTab] = useState<Tab>('offers')
  const [offers, setOffers] = useState<Offer[]>([])
  const [requests, setRequests] = useState<PhoneRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [counterFor, setCounterFor] = useState<Offer | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [offerData, requestData] = await Promise.all([
        api<{ offers: Offer[] }>('/api/offers?role=seller'),
        api<{ requests: PhoneRequest[] }>('/api/phone-requests?role=seller'),
      ])
      setOffers(offerData.offers)
      setRequests(requestData.requests)
    } catch {
      toast.error('Could not load your requests.')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  async function respondToOffer(
    offer: Offer,
    action: 'accept' | 'reject' | 'counter',
    counterRupees?: number,
  ) {
    setBusyId(offer.id)
    try {
      const result = await api<{ status: string }>(`/api/offers/${offer.id}`, {
        method: 'POST',
        body: { action, ...(counterRupees ? { counterRupees } : {}) },
      })
      setOffers((current) =>
        current.map((item) =>
          item.id === offer.id ? { ...item, status: result.status } : item,
        ),
      )
      toast.success(
        action === 'accept'
          ? 'Offer accepted — the item is reserved'
          : action === 'counter'
            ? 'Counter sent'
            : 'Offer declined',
      )
      setCounterFor(null)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not respond.')
    } finally {
      setBusyId(null)
    }
  }

  async function respondToRequest(request: PhoneRequest, action: 'accept' | 'reject') {
    setBusyId(request.id)
    try {
      const result = await api<{ status: string }>(`/api/phone-requests/${request.id}`, {
        method: 'POST',
        body: { action },
      })
      setRequests((current) =>
        current.map((item) =>
          item.id === request.id ? { ...item, status: result.status } : item,
        ),
      )
      toast.success(action === 'accept' ? 'Number shared' : 'Request declined')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not respond.')
    } finally {
      setBusyId(null)
    }
  }

  const pendingOffers = offers.filter((item) => item.status === 'PENDING').length
  const pendingRequests = requests.filter((item) => item.status === 'PENDING').length

  return (
    <div className="mx-auto max-w-2xl px-4 py-5 sm:py-7">
      <h1 className="mb-5 text-[22px] font-semibold tracking-[-0.02em] text-[var(--color-ink)] sm:text-[26px]">
        Requests
      </h1>

      <div
        role="tablist"
        aria-label="Request type"
        className="mb-5 flex gap-1 border-b border-[var(--color-line)]"
      >
        <TabButton
          active={tab === 'offers'}
          onClick={() => setTab('offers')}
          label="Offers"
          count={pendingOffers}
        />
        <TabButton
          active={tab === 'phone'}
          onClick={() => setTab('phone')}
          label="Number requests"
          count={pendingRequests}
        />
      </div>

      {loading ? (
        <div className="divide-y divide-[var(--color-line)]">
          {Array.from({ length: 3 }, (_, index) => (
            <ConversationRowSkeleton key={index} />
          ))}
        </div>
      ) : tab === 'offers' ? (
        offers.length === 0 ? (
          <EmptyState
            illustration="box"
            title="No offers yet"
            description="When someone offers on one of your listings, it lands here."
          />
        ) : (
          <ul className="space-y-2.5">
            <AnimatePresence initial={false}>
              {sortPendingFirst(offers).map((offer) => (
                <motion.li key={offer.id} layout>
                  <OfferCard
                    offer={offer}
                    busy={busyId === offer.id}
                    onAccept={() => void respondToOffer(offer, 'accept')}
                    onReject={() => void respondToOffer(offer, 'reject')}
                    onCounter={() => setCounterFor(offer)}
                  />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )
      ) : requests.length === 0 ? (
        <EmptyState
          illustration="notification"
          title="No number requests"
          description="Buyers who want to call you will ask here first."
        />
      ) : (
        <ul className="space-y-2.5">
          <AnimatePresence initial={false}>
            {sortPendingFirst(requests).map((request) => (
              <motion.li key={request.id} layout>
                <PhoneRequestCard
                  request={request}
                  busy={busyId === request.id}
                  onAccept={() => void respondToRequest(request, 'accept')}
                  onReject={() => void respondToRequest(request, 'reject')}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <CounterSheet
        offer={counterFor}
        onClose={() => setCounterFor(null)}
        busy={busyId !== null}
        onSubmit={(rupees) => counterFor && void respondToOffer(counterFor, 'counter', rupees)}
      />
    </div>
  )
}

/** Pending items first; the rest keep their existing (newest-first) order. */
function sortPendingFirst<T extends { status: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aPending = a.status === 'PENDING' ? 0 : 1
    const bPending = b.status === 'PENDING' ? 0 : 1
    return aPending - bPending
  })
}

function OfferCard({
  offer,
  busy,
  onAccept,
  onReject,
  onCounter,
}: {
  offer: Offer
  busy: boolean
  onAccept: () => void
  onReject: () => void
  onCounter: () => void
}) {
  const pending = offer.status === 'PENDING'
  const asking = offer.listing.priceInPaise
  const delta = offer.amountInPaise - asking
  const percentOff = asking > 0 ? Math.round((-delta / asking) * 100) : 0

  return (
    <div
      className={cn(
        'rounded-[var(--radius-lg)] border p-4',
        pending
          ? 'border-[var(--color-line-strong)] bg-[var(--color-surface)]'
          : 'border-[var(--color-line)] bg-[var(--color-surface-sunken)] opacity-80',
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar
          name={offer.buyer.fullName}
          src={offer.buyer.avatarUrl}
          size="md"
          verified={offer.buyer.isVitVerified}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <Link
              href={`/u/${offer.buyer.id}`}
              className="truncate text-[14px] font-semibold text-[var(--color-ink)] hover:underline"
            >
              {offer.buyer.fullName}
            </Link>
            <span className="text-[11.5px] text-[var(--color-ink-subtle)]">
              {timeAgo(offer.createdAt)}
            </span>
          </div>

          <Link
            href={`/listing/${offer.listing.id}`}
            className="mt-0.5 block truncate text-[12.5px] text-[var(--color-ink-muted)] hover:underline"
          >
            {offer.listing.title}
          </Link>

          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--color-ink)]">
              {formatPrice(offer.amountInPaise)}
            </span>
            {delta !== 0 && (
              <span
                className={cn(
                  'text-[12px]',
                  delta < 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]',
                )}
              >
                {delta < 0 ? `${percentOff}% below` : 'above'} {formatPrice(asking)}
              </span>
            )}
          </div>

          {offer.message && (
            <p className="mt-2 rounded-[var(--radius-sm)] bg-[var(--color-surface-sunken)] px-2.5 py-1.5 text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
              {offer.message}
            </p>
          )}

          {!pending && (
            <div className="mt-2.5">
              <StatusPill status={offer.status} />
            </div>
          )}
        </div>
      </div>

      {pending && (
        <div className="mt-3.5 flex gap-2">
          <Button size="sm" className="flex-1" loading={busy} onClick={onAccept}>
            <CheckIcon className="h-3.5 w-3.5" />
            Accept
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={onCounter}>
            Counter
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onReject}>
            <XIcon className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {offer.conversationId && (
        <Link
          href={`/chats/${offer.conversationId}`}
          className="mt-2.5 inline-block text-[12.5px] font-medium text-[var(--color-accent)] hover:underline"
        >
          Open chat
        </Link>
      )}
    </div>
  )
}

function PhoneRequestCard({
  request,
  busy,
  onAccept,
  onReject,
}: {
  request: PhoneRequest
  busy: boolean
  onAccept: () => void
  onReject: () => void
}) {
  const pending = request.status === 'PENDING'

  return (
    <div
      className={cn(
        'rounded-[var(--radius-lg)] border p-4',
        pending
          ? 'border-[var(--color-line-strong)] bg-[var(--color-surface)]'
          : 'border-[var(--color-line)] bg-[var(--color-surface-sunken)] opacity-80',
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar
          name={request.buyer.fullName}
          src={request.buyer.avatarUrl}
          size="md"
          verified={request.buyer.isVitVerified}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <Link
              href={`/u/${request.buyer.id}`}
              className="truncate text-[14px] font-semibold text-[var(--color-ink)] hover:underline"
            >
              {request.buyer.fullName}
            </Link>
            <span className="text-[11.5px] text-[var(--color-ink-subtle)]">
              {timeAgo(request.createdAt)}
            </span>
          </div>

          <p className="mt-0.5 text-[12.5px] text-[var(--color-ink-muted)]">
            {[ROLE_LABELS[request.buyer.role], request.buyer.department]
              .filter(Boolean)
              .join(' · ')}
          </p>

          <Link
            href={`/listing/${request.listing.id}`}
            className="mt-1.5 block truncate text-[12.5px] text-[var(--color-ink-muted)] hover:underline"
          >
            Wants your number for “{request.listing.title}”
          </Link>

          {request.message && (
            <p className="mt-2 rounded-[var(--radius-sm)] bg-[var(--color-surface-sunken)] px-2.5 py-1.5 text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
              {request.message}
            </p>
          )}

          {!pending && (
            <div className="mt-2.5">
              <StatusPill status={request.status} />
            </div>
          )}
        </div>
      </div>

      {pending && (
        <div className="mt-3.5 flex gap-2">
          <Button size="sm" className="flex-1" loading={busy} onClick={onAccept}>
            <PhoneIcon className="h-3.5 w-3.5" />
            Share my number
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={onReject}>
            Decline
          </Button>
        </div>
      )}
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  switch (status) {
    case 'ACCEPTED':
    case 'AUTO_ACCEPTED':
      return <Badge tone="success">Accepted</Badge>
    case 'REJECTED':
      return <Badge tone="danger">Declined</Badge>
    case 'COUNTERED':
      return <Badge tone="warning">Countered</Badge>
    case 'WITHDRAWN':
      return <Badge tone="neutral">Withdrawn</Badge>
    case 'EXPIRED':
      return <Badge tone="neutral">Expired</Badge>
    default:
      return <Badge tone="neutral">{status}</Badge>
  }
}

function CounterSheet({
  offer,
  onClose,
  busy,
  onSubmit,
}: {
  offer: Offer | null
  onClose: () => void
  busy: boolean
  onSubmit: (rupees: number) => void
}) {
  const [value, setValue] = useState('')

  useEffect(() => {
    // Seed with the asking price — most counters start from there.
    if (offer) setValue(String(Math.round(offer.listing.priceInPaise / 100)))
  }, [offer])

  const amount = Number(value)
  const valid = Number.isFinite(amount) && amount > 0

  return (
    <Sheet
      open={offer !== null}
      onClose={onClose}
      title="Counter this offer"
      description={
        offer
          ? `They offered ${formatPrice(offer.amountInPaise)} on "${offer.listing.title}".`
          : undefined
      }
      size="sm"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" fullWidth onClick={onClose}>
            Cancel
          </Button>
          <Button fullWidth loading={busy} disabled={!valid} onClick={() => onSubmit(amount)}>
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
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoFocus
        />
      </div>
    </Sheet>
  )
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'relative flex items-center gap-1.5 px-4 py-2.5 text-[14px] font-medium transition-colors',
        active
          ? 'text-[var(--color-ink)]'
          : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]',
      )}
    >
      {label}
      {count > 0 && (
        <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[10px] font-semibold text-white">
          {count}
        </span>
      )}
      {active && (
        <motion.span
          layoutId="requests-tab"
          transition={{ type: 'spring', stiffness: 500, damping: 40 }}
          className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-[var(--color-ink)]"
        />
      )}
    </button>
  )
}
