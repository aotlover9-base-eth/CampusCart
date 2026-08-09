'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SerializedListingCard } from '@/lib/listings'
import { api, queryString } from '@/lib/client/fetcher'
import { useInfiniteScroll } from '@/lib/client/use-in-view'
import { FeedSkeleton, ListingCardSkeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { ListingCard } from './listing-card'

/**
 * Cursor-paginated listing grid.
 *
 * Owns fetching so every surface that shows listings - home, browse, search,
 * a profile, saved - reuses one implementation and gets identical loading,
 * empty, and error handling.
 */

export interface FeedFilters {
  q?: string
  category?: string
  condition?: string[]
  minPrice?: number
  maxPrice?: number
  negotiable?: boolean
  freeOnly?: boolean
  sellerRole?: string[]
  vitVerifiedOnly?: boolean
  sellerId?: string
  status?: string
  hostelBlock?: string
  pickupArea?: string
  lat?: number
  lng?: number
  radiusKm?: number
  sort?: string
}

interface FeedResponse {
  listings: SerializedListingCard[]
  nextCursor: string | null
  hasMore: boolean
}

export function ListingFeed({
  filters,
  endpoint = '/api/listings',
  emptyTitle = 'Nothing here yet',
  emptyDescription = 'Try a different category or check back soon.',
  emptyAction,
  initialData,
}: {
  filters: FeedFilters
  /** Swap to /api/search for ranked results; the response shape is the same. */
  endpoint?: string
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: React.ReactNode
  /** Server-rendered first page, so the feed paints without a client fetch. */
  initialData?: FeedResponse
}) {
  const [listings, setListings] = useState<SerializedListingCard[]>(
    initialData?.listings ?? [],
  )
  const [cursor, setCursor] = useState<string | null>(initialData?.nextCursor ?? null)
  const [hasMore, setHasMore] = useState(initialData?.hasMore ?? true)
  const [loading, setLoading] = useState(!initialData)
  const [error, setError] = useState<string | null>(null)

  // Serialised filters double as the reset trigger and as a guard against a
  // slow response from a previous filter set overwriting the current one.
  const filterKey = JSON.stringify(filters)
  const activeKey = useRef(filterKey)

  const load = useCallback(
    async (nextCursor: string | null, replace: boolean) => {
      const requestKey = filterKey
      setLoading(true)
      setError(null)

      try {
        const query = queryString({ ...filters, cursor: nextCursor ?? undefined })
        const data = await api<FeedResponse>(`${endpoint}${query}`)

        // A stale response for filters the user has already moved on from.
        if (activeKey.current !== requestKey) return

        setListings((current) =>
          replace ? data.listings : dedupe([...current, ...data.listings]),
        )
        setCursor(data.nextCursor)
        setHasMore(data.hasMore)
      } catch (caught) {
        if (activeKey.current !== requestKey) return
        setError(caught instanceof Error ? caught.message : 'Could not load listings')
      } finally {
        if (activeKey.current === requestKey) setLoading(false)
      }
    },
    [endpoint, filterKey, filters],
  )

  // Refetch from the top whenever the filters change. The initial render is
  // skipped when the server already supplied a first page.
  const isFirstRender = useRef(true)
  useEffect(() => {
    activeKey.current = filterKey

    if (isFirstRender.current) {
      isFirstRender.current = false
      if (initialData) return
    }

    setListings([])
    setCursor(null)
    setHasMore(true)
    void load(null, true)
    // `load` is keyed off filterKey, so this is the complete dependency set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey])

  const sentinelRef = useInfiniteScroll(
    () => {
      if (cursor) void load(cursor, false)
    },
    { hasMore: hasMore && !error, loading },
  )

  function handleRemoved(id: string) {
    setListings((current) => current.filter((item) => item.id !== id))
  }

  if (loading && listings.length === 0) {
    return <FeedSkeleton />
  }

  if (error && listings.length === 0) {
    return (
      <EmptyState
        illustration="box"
        title="Could not load listings"
        description={error}
        action={
          <Button variant="secondary" onClick={() => void load(null, true)}>
            Try again
          </Button>
        }
      />
    )
  }

  if (listings.length === 0) {
    return (
      <EmptyState
        illustration="search"
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {listings.map((listing, index) => (
          <ListingCard
            key={listing.id}
            listing={listing}
            priority={index < 4}
            onRemoved={handleRemoved}
          />
        ))}

        {loading &&
          Array.from({ length: 4 }, (_, index) => (
            <ListingCardSkeleton key={`skeleton-${index}`} />
          ))}
      </div>

      {/* Sentinel: crossing it requests the next page. */}
      <div ref={sentinelRef} aria-hidden="true" className="h-px" />

      {error && listings.length > 0 && (
        <div className="py-6 text-center">
          <p className="mb-3 text-[13px] text-[var(--color-ink-muted)]">{error}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => cursor && void load(cursor, false)}
          >
            Retry
          </Button>
        </div>
      )}

      {!hasMore && !loading && listings.length > 8 && (
        <p className="py-8 text-center text-[13px] text-[var(--color-ink-subtle)]">
          That's everything.
        </p>
      )}
    </>
  )
}

/** Guards against a duplicate row if a listing is posted mid-pagination. */
function dedupe(items: SerializedListingCard[]): SerializedListingCard[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}
