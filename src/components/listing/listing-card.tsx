'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import type { SerializedListingCard } from '@/lib/listings'
import { api } from '@/lib/client/fetcher'
import { cn, formatDistance, formatPrice, timeAgo } from '@/lib/utils'
import { Badge, ConditionBadge, StatusBadge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { BookmarkIcon, EyeIcon, HeartIcon, MapPinIcon } from '@/components/ui/icons'
import { PICKUP_AREA_LABELS, hostelBlockLabel } from '@/lib/constants'
import { ListingMedia, MediaFallback } from './listing-media'

/**
 * Feed card.
 *
 * The whole card is one link; the like and save controls sit above it and stop
 * propagation. Both are optimistic — the count moves immediately and rolls back
 * only if the request fails, because a marketplace feed that waits on a round
 * trip to fill a heart feels broken.
 */

export function ListingCard({
  listing,
  priority = false,
  onRemoved,
}: {
  listing: SerializedListingCard
  /** Set on the first row so its image is not lazy-loaded. */
  priority?: boolean
  /** Called after an unsave, so the saved-listings page can drop the card. */
  onRemoved?: (id: string) => void
}) {
  const [liked, setLiked] = useState(listing.isLiked)
  const [likeCount, setLikeCount] = useState(listing.likeCount)
  const [saved, setSaved] = useState(listing.isSaved)
  const [pending, setPending] = useState<'like' | 'save' | null>(null)

  const cover = listing.media[0]
  const isSold = listing.status === 'SOLD'

  async function toggleLike(event: React.MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    if (pending) return

    const nextLiked = !liked
    setLiked(nextLiked)
    setLikeCount((count) => count + (nextLiked ? 1 : -1))
    setPending('like')

    try {
      const result = await api<{ liked: boolean; likeCount: number }>(
        `/api/listings/${listing.id}/like`,
        { method: nextLiked ? 'POST' : 'DELETE' },
      )
      // Trust the server's count — another viewer may have liked it meanwhile.
      setLiked(result.liked)
      setLikeCount(result.likeCount)
    } catch {
      setLiked(!nextLiked)
      setLikeCount((count) => count + (nextLiked ? -1 : 1))
    } finally {
      setPending(null)
    }
  }

  async function toggleSave(event: React.MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    if (pending) return

    const nextSaved = !saved
    setSaved(nextSaved)
    setPending('save')

    try {
      await api(`/api/listings/${listing.id}/save`, {
        method: nextSaved ? 'POST' : 'DELETE',
      })
      if (!nextSaved) onRemoved?.(listing.id)
    } catch {
      setSaved(!nextSaved)
    } finally {
      setPending(null)
    }
  }

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="group relative"
    >
      <Link
        href={`/listing/${listing.id}`}
        className={cn(
          'block overflow-hidden rounded-[var(--radius-lg)] card-hover-glow',
          'border border-[var(--color-line)] bg-[var(--color-surface)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2',
        )}
      >
        <div className="relative aspect-[4/3] overflow-hidden">
          {cover ? (
            <ListingMedia
              item={{
                url: cover.url,
                type: cover.kind,
                thumbnailUrl: cover.thumbnailUrl,
                blurDataUrl: cover.blurDataUrl,
              }}
              priority={priority}
              className="h-full w-full transition-transform duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <MediaFallback className="h-full w-full" />
          )}

          {isSold && (
            <div className="absolute inset-0 grid place-items-center bg-black/45 backdrop-blur-[1px]">
              <span className="rounded-full bg-white px-3.5 py-1.5 text-[13px] font-semibold text-black">
                Sold
              </span>
            </div>
          )}

          <div className="absolute right-2 top-2 flex flex-col gap-1.5">
            <IconAction
              onClick={toggleSave}
              active={saved}
              label={saved ? 'Remove from saved' : 'Save listing'}
            >
              <BookmarkIcon filled={saved} className="h-4 w-4" />
            </IconAction>
          </div>

          {listing.media.length > 1 && (
            <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
              1/{listing.media.length}
            </span>
          )}
        </div>

        <div className="space-y-1.5 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--color-ink)]">
              {listing.isFree ? 'Free' : formatPrice(listing.priceInPaise, { compact: true })}
            </p>
            {listing.isNegotiable && !listing.isFree && (
              <span className="text-[11px] text-[var(--color-ink-subtle)]">Negotiable</span>
            )}
          </div>

          <h3 className="line-clamp-2 text-[13px] leading-snug text-[var(--color-ink)]">
            {listing.title}
          </h3>

          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <ConditionBadge condition={listing.condition} />
            {!isSold && <StatusBadge status={listing.status} />}
            {listing.isFeatured && <Badge tone="accent">Featured</Badge>}
          </div>

          <div className="flex items-center gap-1.5 pt-1.5 text-[11px] text-[var(--color-ink-muted)]">
            <Avatar
              name={listing.seller.fullName}
              src={listing.seller.avatarUrl}
              size="xs"
              verified={listing.seller.isVitVerified}
            />
            <span className="min-w-0 flex-1 truncate">{listing.seller.fullName}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={new Date(listing.publishedAt ?? listing.createdAt).toISOString()}>
              {timeAgo(listing.publishedAt ?? listing.createdAt)}
            </time>
          </div>

          <div className="flex items-center gap-3 pt-1 text-[11px] text-[var(--color-ink-subtle)]">
            {(listing.locationLabel || listing.hostelBlock || listing.pickupArea) && (
              <span className="flex min-w-0 items-center gap-1">
                <MapPinIcon className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {listing.hostelBlock
                    ? hostelBlockLabel(listing.hostelBlock)
                    : (listing.locationLabel ??
                      PICKUP_AREA_LABELS[listing.pickupArea] ??
                      null)}
                </span>
              </span>
            )}
            {listing.distanceKm != null && (
              <span className="shrink-0">{formatDistance(listing.distanceKm)}</span>
            )}
            <span className="ml-auto flex shrink-0 items-center gap-2.5">
              <span className="flex items-center gap-1">
                <EyeIcon className="h-3 w-3" />
                {listing.viewCount}
              </span>
              <button
                type="button"
                onClick={toggleLike}
                aria-label={liked ? 'Unlike' : 'Like'}
                aria-pressed={liked}
                className={cn(
                  'flex items-center gap-1 rounded-full transition-colors',
                  liked ? 'text-[var(--color-danger)]' : 'hover:text-[var(--color-ink)]',
                )}
              >
                <HeartIcon filled={liked} className="h-3 w-3" />
                {likeCount}
              </button>
            </span>
          </div>
        </div>
      </Link>
    </motion.article>
  )
}

/** Floating control over the media area. */
function IconAction({
  children,
  onClick,
  active,
  label,
}: {
  children: React.ReactNode
  onClick: (event: React.MouseEvent) => void
  active?: boolean
  label: string
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      whileTap={{ scale: 0.88 }}
      transition={{ type: 'spring', stiffness: 600, damping: 26 }}
      className={cn(
        'grid h-8 w-8 place-items-center rounded-full backdrop-blur-sm transition-colors',
        active
          ? 'bg-[var(--color-ink)] text-[var(--color-ink-inverse)]'
          : 'bg-black/45 text-white hover:bg-black/65',
      )}
    >
      {children}
    </motion.button>
  )
}
