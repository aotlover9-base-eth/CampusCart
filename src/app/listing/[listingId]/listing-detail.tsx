'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { SerializedListingCard } from '@/lib/listings'
import { api, ApiError } from '@/lib/client/fetcher'
import { cn, formatDistance, formatPrice, timeAgo } from '@/lib/utils'
import { CONDITION_LABELS, ROLE_LABELS, Badge, StatusBadge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Sheet, ConfirmDialog } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { ListingGallery, type GalleryItem } from '@/components/listing/listing-gallery'
import { OfferSheet } from '@/components/listing/offer-sheet'
import { PICKUP_AREA_LABELS, REPORT_REASONS, hostelBlockLabel } from '@/lib/constants'
import {
  BookmarkIcon,
  ChatIcon,
  ClockIcon,
  EditIcon,
  EyeIcon,
  FlagIcon,
  HeartIcon,
  MapPinIcon,
  PhoneIcon,
  ShareIcon,
  TagIcon,
  TrashIcon,
} from '@/components/ui/icons'

/**
 * Listing detail.
 *
 * Two columns on desktop — gallery left, a sticky action rail right. On mobile
 * the rail collapses into a fixed bottom bar so the primary action stays in
 * reach while the description scrolls.
 */

type DetailListing = SerializedListingCard & {
  description: string
  contactPreference: string
  availabilityNote: string | null
  chatCount: number
  latitude: number | null
  longitude: number | null
  googleMapsUrl: string | null
  media: GalleryItem[]
}

interface Seller {
  id: string
  fullName: string
  avatarUrl: string | null
  role: string
  isVitVerified: boolean
  isOnline: boolean
  lastSeenAt: string
  department: string | null
  year: number | null
  createdAt: string
  listingCount: number
  soldCount: number
}

export function ListingDetail({
  listing,
  seller,
  isOwner,
  isSignedIn,
}: {
  listing: DetailListing
  seller: Seller
  isOwner: boolean
  isSignedIn: boolean
}) {
  const router = useRouter()
  const toast = useToast()

  const [liked, setLiked] = useState(listing.isLiked)
  const [likeCount, setLikeCount] = useState(listing.likeCount)
  const [saved, setSaved] = useState(listing.isSaved)
  const [status, setStatus] = useState(listing.status)

  const [reportOpen, setReportOpen] = useState(false)
  const [offerOpen, setOfferOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const isSold = status === 'SOLD'
  // Nothing to negotiate on a free or fixed-price item.
  const canOffer = listing.isNegotiable && !listing.isFree

  function requireAuth(): boolean {
    if (isSignedIn) return true
    router.push(`/login?next=/listing/${listing.id}`)
    return false
  }

  async function toggleLike() {
    if (!requireAuth()) return

    const next = !liked
    setLiked(next)
    setLikeCount((count) => count + (next ? 1 : -1))

    try {
      const result = await api<{ liked: boolean; likeCount: number }>(
        `/api/listings/${listing.id}/like`,
        { method: next ? 'POST' : 'DELETE' },
      )
      setLiked(result.liked)
      setLikeCount(result.likeCount)
    } catch {
      setLiked(!next)
      setLikeCount((count) => count + (next ? -1 : 1))
      toast.error('Could not update that.')
    }
  }

  async function toggleSave() {
    if (!requireAuth()) return

    const next = !saved
    setSaved(next)

    try {
      await api(`/api/listings/${listing.id}/save`, { method: next ? 'POST' : 'DELETE' })
      toast.toast(next ? 'Saved to your list' : 'Removed from saved', { tone: 'success' })
    } catch {
      setSaved(!next)
      toast.error('Could not update that.')
    }
  }

  async function share() {
    const url = window.location.href
    const shareData = {
      title: listing.title,
      text: `${listing.title} — ${listing.isFree ? 'Free' : formatPrice(listing.priceInPaise)} on CampusCart`,
      url,
    }

    // The Web Share sheet is the native path on mobile; clipboard is the
    // desktop fallback. A dismissed share sheet throws AbortError — not an error
    // worth surfacing.
    if (navigator.share) {
      try {
        await navigator.share(shareData)
        return
      } catch {
        return
      }
    }

    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied')
    } catch {
      toast.error('Could not copy the link.')
    }
  }

  async function startChat() {
    if (!requireAuth()) return

    setBusy(true)
    try {
      const result = await api<{ conversation: { id: string } }>('/api/conversations', {
        method: 'POST',
        body: { listingId: listing.id },
      })
      router.push(`/chats/${result.conversation.id}`)
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'Could not start that chat.',
      )
      setBusy(false)
    }
  }

  async function changeStatus(action: 'mark_sold' | 'mark_available') {
    setBusy(true)
    try {
      const result = await api<{ listing: { status: DetailListing['status'] } }>(
        `/api/listings/${listing.id}/status`,
        { method: 'POST', body: { action } },
      )
      setStatus(result.listing.status)
      toast.success(action === 'mark_sold' ? 'Marked as sold' : 'Back on sale')
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not update the listing.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await api(`/api/listings/${listing.id}`, { method: 'DELETE' })
      toast.success('Listing deleted')
      router.push('/home')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not delete that.')
      setBusy(false)
      setDeleteOpen(false)
    }
  }

  return (
    <div className="mx-auto max-w-[var(--container-max)] px-4 py-5 sm:py-7">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-8">
        <div className="min-w-0">
          <ListingGallery media={listing.media} title={listing.title} />

          <section className="mt-7">
            <h2 className="text-[15px] font-semibold text-[var(--color-ink)]">Description</h2>
            {/* whitespace-pre-wrap preserves the seller's line breaks without
                letting any markup through — this is plain text, not HTML. */}
            <p className="mt-2.5 whitespace-pre-wrap text-[14.5px] leading-relaxed text-[var(--color-ink-muted)]">
              {listing.description}
            </p>
          </section>

          <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-[var(--color-line)] pt-6 sm:grid-cols-3">
            <Detail label="Condition" value={CONDITION_LABELS[listing.condition] ?? listing.condition} />
            <Detail label="Category" value={listing.category.displayName} />
            <Detail
              label="Price"
              value={listing.isNegotiable && !listing.isFree ? 'Negotiable' : 'Fixed'}
            />
            {listing.availabilityNote && (
              <Detail label="Availability" value={listing.availabilityNote} />
            )}
            <Detail label="Posted" value={timeAgo(listing.publishedAt ?? listing.createdAt)} />
            <Detail label="Views" value={String(listing.viewCount)} />
          </dl>

          {(listing.locationLabel || listing.hostelBlock || listing.googleMapsUrl) && (
            <section className="mt-7 border-t border-[var(--color-line)] pt-6">
              <h2 className="text-[15px] font-semibold text-[var(--color-ink)]">Pickup</h2>
              <p className="mt-2 flex items-center gap-2 text-[14px] text-[var(--color-ink-muted)]">
                <MapPinIcon className="h-4 w-4 shrink-0" />
                {listing.hostelBlock
                  ? hostelBlockLabel(listing.hostelBlock)
                  : (listing.locationLabel ?? 'Shared in chat')}
                <span className="text-[var(--color-ink-subtle)]">
                  · {PICKUP_AREA_LABELS[listing.pickupArea] ?? 'Inside campus'}
                </span>
                {listing.distanceKm != null && (
                  <span className="text-[var(--color-ink-subtle)]">
                    · {formatDistance(listing.distanceKm)}
                  </span>
                )}
              </p>
              {listing.googleMapsUrl && (
                <a
                  href={listing.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="mt-2 inline-block text-[13px] font-medium text-[var(--color-accent)] underline underline-offset-2"
                >
                  Open in Google Maps
                </a>
              )}
            </section>
          )}
        </div>

        {/* Action rail */}
        <aside className="mt-8 lg:sticky lg:top-[calc(var(--nav-height)+24px)] lg:mt-0">
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={status} />
              {listing.isFeatured && <Badge tone="accent">Featured</Badge>}
              {listing.isNegotiable && !listing.isFree && <Badge tone="outline">Negotiable</Badge>}
            </div>

            <p className="mt-2.5 text-[30px] font-semibold tracking-[-0.03em] text-[var(--color-ink)]">
              {listing.isFree ? 'Free' : formatPrice(listing.priceInPaise)}
            </p>

            <h1 className="mt-1 text-[17px] font-medium leading-snug text-[var(--color-ink)]">
              {listing.title}
            </h1>

            <div className="mt-3 flex items-center gap-4 text-[12.5px] text-[var(--color-ink-subtle)]">
              <span className="flex items-center gap-1">
                <EyeIcon className="h-3.5 w-3.5" /> {listing.viewCount}
              </span>
              <span className="flex items-center gap-1">
                <HeartIcon className="h-3.5 w-3.5" /> {likeCount}
              </span>
              <span className="flex items-center gap-1">
                <ClockIcon className="h-3.5 w-3.5" />
                {timeAgo(listing.publishedAt ?? listing.createdAt)}
              </span>
            </div>

            <hr className="my-5 border-[var(--color-line)]" />

            <Link
              href={`/u/${seller.id}`}
              className="flex items-center gap-3 rounded-[var(--radius-md)] p-2 -m-2 transition-colors hover:bg-[var(--color-surface-hover)]"
            >
              <Avatar
                name={seller.fullName}
                src={seller.avatarUrl}
                size="md"
                verified={seller.isVitVerified}
                online={seller.isOnline}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-[var(--color-ink)]">
                  {seller.fullName}
                </p>
                <p className="truncate text-[12.5px] text-[var(--color-ink-muted)]">
                  {[ROLE_LABELS[seller.role], seller.department].filter(Boolean).join(' · ') ||
                    'Member'}
                </p>
              </div>
            </Link>

            <p className="mt-2.5 text-[12px] text-[var(--color-ink-subtle)]">
              {seller.listingCount} listed · {seller.soldCount} sold · joined{' '}
              {timeAgo(seller.createdAt)}
            </p>

            {/* Desktop actions. The mobile equivalents live in the bottom bar. */}
            <div className="mt-5 hidden space-y-2 lg:block">
              {isOwner ? (
                <OwnerActions
                  listingId={listing.id}
                  isSold={isSold}
                  busy={busy}
                  onToggleSold={() => void changeStatus(isSold ? 'mark_available' : 'mark_sold')}
                  onDelete={() => setDeleteOpen(true)}
                />
              ) : (
                <BuyerActions
                  isSold={isSold}
                  busy={busy}
                  contactPreference={listing.contactPreference}
                  onChat={() => void startChat()}
                  onRequestPhone={() => router.push(`/listing/${listing.id}/contact`)}
                  canOffer={canOffer}
                  onMakeOffer={() => (requireAuth() ? setOfferOpen(true) : undefined)}
                />
              )}
            </div>

            <div className="mt-4 flex items-center gap-2 border-t border-[var(--color-line)] pt-4">
              <SecondaryAction
                onClick={() => void toggleSave()}
                active={saved}
                label={saved ? 'Saved' : 'Save'}
                icon={<BookmarkIcon filled={saved} className="h-4 w-4" />}
              />
              <SecondaryAction
                onClick={() => void toggleLike()}
                active={liked}
                label={String(likeCount)}
                icon={<HeartIcon filled={liked} className="h-4 w-4" />}
              />
              <SecondaryAction
                onClick={() => void share()}
                label="Share"
                icon={<ShareIcon className="h-4 w-4" />}
              />
              {!isOwner && (
                <SecondaryAction
                  onClick={() => (requireAuth() ? setReportOpen(true) : undefined)}
                  label="Report"
                  icon={<FlagIcon className="h-4 w-4" />}
                />
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile bottom action bar */}
      <div
        className={cn(
          'glass fixed inset-x-0 bottom-0 z-[var(--z-nav)] border-t border-[var(--color-line)]',
          'flex items-center gap-2 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] lg:hidden',
        )}
      >
        {isOwner ? (
          <OwnerActions
            listingId={listing.id}
            isSold={isSold}
            busy={busy}
            compact
            onToggleSold={() => void changeStatus(isSold ? 'mark_available' : 'mark_sold')}
            onDelete={() => setDeleteOpen(true)}
          />
        ) : (
          <BuyerActions
            isSold={isSold}
            busy={busy}
            compact
            contactPreference={listing.contactPreference}
            onChat={() => void startChat()}
            onRequestPhone={() => router.push(`/listing/${listing.id}/contact`)}
            canOffer={canOffer}
            onMakeOffer={() => (requireAuth() ? setOfferOpen(true) : undefined)}
          />
        )}
      </div>

      <OfferSheet
        open={offerOpen}
        onClose={() => setOfferOpen(false)}
        listing={{
          id: listing.id,
          title: listing.title,
          priceInPaise: listing.priceInPaise,
        }}
      />

      <ReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        listingId={listing.id}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void remove()}
        loading={busy}
        title="Delete this listing?"
        description="It disappears from the feed and from anyone who saved it. This cannot be undone."
        confirmLabel="Delete listing"
      />
    </div>
  )
}

function OwnerActions({
  listingId,
  isSold,
  busy,
  compact,
  onToggleSold,
  onDelete,
}: {
  listingId: string
  isSold: boolean
  busy: boolean
  compact?: boolean
  onToggleSold: () => void
  onDelete: () => void
}) {
  return (
    <>
      <Button
        variant={isSold ? 'secondary' : 'primary'}
        size={compact ? 'md' : 'lg'}
        fullWidth={!compact}
        loading={busy}
        onClick={onToggleSold}
        className={compact ? 'flex-1' : undefined}
      >
        {isSold ? 'Mark available' : 'Mark as sold'}
      </Button>

      <Link
        href={`/sell/${listingId}`}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-[10px] border font-medium transition-colors',
          'border-[var(--color-line-strong)] text-[var(--color-ink)] hover:bg-[var(--color-surface-hover)]',
          compact ? 'h-10 px-4 text-sm' : 'h-12 w-full text-[15px]',
        )}
      >
        <EditIcon className="h-4 w-4" />
        {compact ? '' : 'Edit listing'}
      </Link>

      <Button
        variant="ghost"
        size={compact ? 'icon' : 'lg'}
        fullWidth={!compact}
        onClick={onDelete}
        className="text-[var(--color-danger)]"
        aria-label="Delete listing"
      >
        <TrashIcon className="h-4 w-4" />
        {!compact && 'Delete'}
      </Button>
    </>
  )
}

function BuyerActions({
  isSold,
  busy,
  compact,
  contactPreference,
  canOffer,
  onChat,
  onRequestPhone,
  onMakeOffer,
}: {
  isSold: boolean
  busy: boolean
  compact?: boolean
  contactPreference: string
  /** Negotiable, non-free listings only — nothing to haggle over otherwise. */
  canOffer: boolean
  onChat: () => void
  onRequestPhone: () => void
  onMakeOffer: () => void
}) {
  if (isSold) {
    return (
      <div
        className={cn(
          'rounded-[10px] bg-[var(--color-surface-sunken)] px-4 py-3 text-center text-[13px] text-[var(--color-ink-muted)]',
          compact && 'flex-1',
        )}
      >
        This item has been sold.
      </div>
    )
  }

  return (
    <>
      <Button
        size={compact ? 'md' : 'lg'}
        fullWidth={!compact}
        loading={busy}
        onClick={onChat}
        className={compact ? 'flex-1' : undefined}
      >
        <ChatIcon className="h-4 w-4" />
        Message seller
      </Button>

      {canOffer && (
        <Button
          variant="secondary"
          size={compact ? 'md' : 'lg'}
          fullWidth={!compact}
          disabled={busy}
          onClick={onMakeOffer}
          className={compact ? 'shrink-0' : undefined}
          aria-label="Make an offer"
        >
          <TagIcon className="h-4 w-4" />
          {compact ? '' : 'Make an offer'}
        </Button>
      )}

      {/* CHAT_ONLY sellers never expose a number, so the option is not offered. */}
      {contactPreference !== 'CHAT_ONLY' && (
        <Button
          variant="secondary"
          size={compact ? 'md' : 'lg'}
          fullWidth={!compact}
          onClick={onRequestPhone}
          className={compact ? 'shrink-0' : undefined}
          aria-label="Request phone number"
        >
          <PhoneIcon className="h-4 w-4" />
          {compact ? '' : 'Request number'}
        </Button>
      )}
    </>
  )
}

function SecondaryAction({
  onClick,
  active,
  label,
  icon,
}: {
  onClick: () => void
  active?: boolean
  label: string
  icon: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex flex-1 flex-col items-center gap-1 rounded-[10px] py-2 text-[11.5px] font-medium transition-colors',
        active
          ? 'text-[var(--color-ink)]'
          : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)]',
      )}
    >
      {icon}
      {label}
    </button>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] text-[var(--color-ink-subtle)]">{label}</dt>
      <dd className="mt-0.5 text-[14px] text-[var(--color-ink)]">{value}</dd>
    </div>
  )
}

function ReportSheet({
  open,
  onClose,
  listingId,
}: {
  open: boolean
  onClose: () => void
  listingId: string
}) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    if (!reason) return

    setSubmitting(true)
    try {
      await api('/api/reports', {
        method: 'POST',
        body: { targetType: 'LISTING', listingId, reason, details: details.trim() || undefined },
      })
      toast.success('Report sent. Our team will review it.')
      onClose()
      setReason('')
      setDetails('')
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not send that report.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Report this listing"
      description="Tell us what's wrong. Reports are anonymous to the seller."
      size="sm"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" fullWidth onClick={onClose}>
            Cancel
          </Button>
          <Button fullWidth loading={submitting} disabled={!reason} onClick={() => void submit()}>
            Send report
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        <Select
          label="Reason"
          placeholder="Choose a reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        >
          {REPORT_REASONS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>

        <Textarea
          label="Details (optional)"
          placeholder="Anything that helps us understand the problem."
          value={details}
          maxLength={1000}
          onChange={(event) => setDetails(event.target.value)}
        />
      </div>
    </Sheet>
  )
}
