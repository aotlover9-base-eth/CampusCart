'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import type { CategoryNode } from '@/lib/categories'
import { cn } from '@/lib/utils'
import { useCurrentUser } from '@/components/providers/session-provider'
import { ListingFeed, type FeedFilters } from '@/components/listing/listing-feed'
import { CategoryIcon } from '@/components/brand/icons'
import { SORT_OPTIONS, SortSelect } from '@/components/listing/sort-select'

/**
 * Home feed: category rail, sort control, and the listing grid.
 *
 * Filters live in component state rather than the URL - home is a browsing
 * surface, and /browse is the shareable, URL-driven one. Distance sort needs
 * coordinates, so it is only offered to users who have a saved location.
 */
export function HomeFeed({ categories }: { categories: CategoryNode[] }) {
  const user = useCurrentUser()
  const [categorySlug, setCategorySlug] = useState<string | null>(null)
  const [sort, setSort] = useState<string>('newest')

  const hasCoordinates = user.latitude != null && user.longitude != null

  const filters = useMemo<FeedFilters>(
    () => ({
      category: categorySlug ?? undefined,
      sort,
      ...(sort === 'distance' && hasCoordinates
        ? { lat: user.latitude ?? undefined, lng: user.longitude ?? undefined }
        : {}),
    }),
    [categorySlug, sort, hasCoordinates, user.latitude, user.longitude],
  )

  const sortOptions = useMemo(
    () => SORT_OPTIONS.filter((option) => option.value !== 'distance' || hasCoordinates),
    [hasCoordinates],
  )

  const activeCategory = categories.find((category) => category.slug === categorySlug)

  return (
    <>
      {/* Horizontal category rail. Scrolls on mobile, wraps nowhere. */}
      <div className="-mx-4 mb-4 overflow-x-auto px-4 pb-1 no-scrollbar">
        <div className="flex items-center gap-2">
          <CategoryChip
            label="All"
            active={categorySlug === null}
            onClick={() => setCategorySlug(null)}
          />
          {categories.map((category) => (
            <CategoryChip
              key={category.id}
              label={category.name}
              icon={category.icon}
              count={category.listingCount}
              active={categorySlug === category.slug}
              onClick={() =>
                setCategorySlug((current) =>
                  current === category.slug ? null : category.slug,
                )
              }
            />
          ))}
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          {activeCategory ? activeCategory.name : 'All listings'}
        </p>
        <SortSelect value={sort} onChange={setSort} options={sortOptions} />
      </div>

      <ListingFeed
        filters={filters}
        emptyTitle={activeCategory ? `No ${activeCategory.name} listings` : 'Feed is empty'}
        emptyDescription={
          activeCategory
            ? 'Nothing in this category yet. Try another, or list something yourself.'
            : 'Be the first to list something on campus.'
        }
        emptyAction={
          <Link
            href="/sell"
            className="inline-flex h-9 items-center rounded-[10px] bg-[var(--color-ink)] px-4 text-sm font-medium text-[var(--color-ink-inverse)] transition-opacity hover:opacity-90"
          >
            Create a listing
          </Link>
        }
      />
    </>
  )
}

function CategoryChip({
  label,
  icon,
  count,
  active,
  onClick,
}: {
  label: string
  icon?: string | null
  count?: number
  active: boolean
  onClick: () => void
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      aria-pressed={active}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5',
        'text-[13px] font-medium transition-colors',
        active
          ? 'border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-ink-inverse)]'
          : 'border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-muted)] hover:border-[var(--color-line-strong)] hover:text-[var(--color-ink)]',
      )}
    >
      {icon && <CategoryIcon name={icon} className="h-3.5 w-3.5" />}
      {label}
      {count != null && count > 0 && (
        <span className={cn('text-[11px]', active ? 'opacity-70' : 'opacity-60')}>
          {count}
        </span>
      )}
    </motion.button>
  )
}
