import type { Metadata } from 'next'
import Link from 'next/link'
import { currentUser } from '@/lib/auth/context'
import { db } from '@/lib/db'
import {
  encodeCursor,
  listingCardSelect,
  serializeListingCard,
  viewerInteractions,
  visibilityWhere,
} from '@/lib/listings'
import { getSessionUser } from '@/lib/auth/session-user'
import { listCategories } from '@/lib/categories'
import { HomeFeed } from './home-feed'

export const metadata: Metadata = {
  title: 'Buy',
  description: 'Browse what VIT Bhopal students are selling right now.',
}

// The feed is per-user (saved and liked state), so it cannot be statically cached.
export const dynamic = 'force-dynamic'

async function getInitialListings() {
  const viewer = await currentUser()
  const where = visibilityWhere(viewer?.id)

  const rows = await db.listing.findMany({
    where,
    select: listingCardSelect,
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    take: 21,
  })

  const hasMore = rows.length > 20
  const page = hasMore ? rows.slice(0, 20) : rows
  const interactions = await viewerInteractions(viewer?.id, page.map((r) => r.id))

  const listings = page.map((row) => serializeListingCard(row, interactions))
  const last = page[page.length - 1]
  const nextCursor =
    hasMore && last
      ? encodeCursor({ sortValue: (last.publishedAt ?? new Date(0)).toISOString(), id: last.id })
      : null

  return { listings, nextCursor, hasMore }
}

export default async function HomePage() {
  // All independent reads run in parallel on the server
  const [user, categories, initialData] = await Promise.all([
    getSessionUser(),
    listCategories(),
    getInitialListings(),
  ])

  const firstName = user?.fullName.split(' ')[0] ?? 'there'

  return (
    <div className="mx-auto max-w-[var(--container-max)] px-4 py-5 sm:py-7">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--color-ink)] sm:text-[26px]">
            Hey {firstName}
          </h1>
          <p className="mt-0.5 text-[13px] text-[var(--color-ink-muted)]">
            Fresh listings from your campus.
          </p>
        </div>

        <Link
          href="/sell"
          className="hidden h-9 items-center rounded-[10px] bg-[var(--color-ink)] px-4 text-sm font-medium text-[var(--color-ink-inverse)] transition-opacity hover:opacity-90 sm:inline-flex"
        >
          Sell something
        </Link>
      </header>

      <HomeFeed categories={categories} initialData={initialData} />
    </div>
  )
}
