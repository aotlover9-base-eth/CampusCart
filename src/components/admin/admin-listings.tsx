'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { api, ApiError } from '@/lib/client/fetcher'
import { formatPrice, timeAgo } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { AdminList, AdminRow, FilterTabs } from './admin-list'

/**
 * Listing moderation.
 *
 * The default view is everything; the "Reported" filter is the one that matters
 * day to day and is one tap away.
 */

interface AdminListing {
  id: string
  title: string
  priceInPaise: number
  isFree: boolean
  status: string
  isFeatured: boolean
  viewCount: number
  reportCount: number
  seller: { id: string; fullName: string; avatarUrl: string | null }
  thumbnailUrl: string | null
  createdAt: string
  isDeleted: boolean
}

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'reported', label: 'Reported' },
  { value: 'PENDING_APPROVAL', label: 'Awaiting review' },
  { value: 'ACTIVE', label: 'Live' },
  { value: 'REMOVED', label: 'Removed' },
]

export function AdminListings() {
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')

  async function act(listing: AdminListing, action: string, refresh: () => void) {
    try {
      await api('/api/admin/listings', {
        method: 'PATCH',
        body: { listingId: listing.id, action },
      })
      toast.success(`"${listing.title}": ${action}`)
      refresh()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Action failed')
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--color-ink)]">
          Listings
        </h1>
        <p className="mt-0.5 text-[13px] text-[var(--color-ink-muted)]">
          Removing a listing notifies the seller.
        </p>
      </header>

      <AdminList<AdminListing>
        endpoint="/api/admin/listings"
        dataKey="listings"
        filters={{
          q: search || undefined,
          // "reported" is a flag, not a status — send it on the right param.
          ...(filter === 'reported'
            ? { reported: 'true' }
            : filter
              ? { status: filter }
              : {}),
        }}
        searchValue={search}
        onSearch={setSearch}
        searchPlaceholder="Search listing titles"
        toolbar={<FilterTabs options={FILTERS} value={filter} onChange={setFilter} />}
        emptyMessage="No listings match."
        renderRow={(listing, refresh) => (
          <AdminRow tone={listing.reportCount > 0 ? 'warning' : 'default'}>
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-surface-sunken)]">
              {listing.thumbnailUrl && (
                <Image
                  src={listing.thumbnailUrl}
                  alt=""
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/listing/${listing.id}`}
                  target="_blank"
                  className="truncate text-[13.5px] font-medium text-[var(--color-ink)] hover:underline"
                >
                  {listing.title}
                </Link>
                {listing.isFeatured && <Badge tone="accent">Featured</Badge>}
                {listing.reportCount > 0 && (
                  <Badge tone="warning">{listing.reportCount} reports</Badge>
                )}
                {listing.status !== 'ACTIVE' && (
                  <Badge tone={listing.status === 'REMOVED' ? 'danger' : 'neutral'}>
                    {listing.status.replace(/_/g, ' ').toLowerCase()}
                  </Badge>
                )}
              </div>

              <p className="truncate text-[12px] text-[var(--color-ink-muted)]">
                {listing.isFree ? 'Free' : formatPrice(listing.priceInPaise)} ·{' '}
                {listing.seller.fullName} · {listing.viewCount} views ·{' '}
                {timeAgo(listing.createdAt)}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap gap-1.5">
              {listing.status === 'PENDING_APPROVAL' && (
                <Button size="sm" onClick={() => void act(listing, 'approve', refresh)}>
                  Approve
                </Button>
              )}

              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void act(listing, listing.isFeatured ? 'unfeature' : 'feature', refresh)
                }
              >
                {listing.isFeatured ? 'Unfeature' : 'Feature'}
              </Button>

              {listing.status === 'REMOVED' ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void act(listing, 'restore', refresh)}
                >
                  Restore
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-[var(--color-danger)]"
                  onClick={() => void act(listing, 'remove', refresh)}
                >
                  Remove
                </Button>
              )}
            </div>
          </AdminRow>
        )}
      />
    </div>
  )
}
