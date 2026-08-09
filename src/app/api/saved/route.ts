import { NextResponse } from 'next/server'
import { handler, ok, parseQuery } from '@/lib/api'
import { requireUser } from '@/lib/auth/context'
import { cursorPaginationSchema } from '@/lib/validation'
import { db } from '@/lib/db'
import {
  listingCardSelect,
  serializeListingCard,
  viewerInteractions,
} from '@/lib/listings'

/**
 * GET /api/saved - the viewer's saved listings, most recently saved first.
 *
 * Paginates over SavedListing rather than Listing, because the meaningful order
 * here is when the user saved something, not when it was posted. The response
 * shape matches /api/listings so the same feed component renders it.
 */
export async function GET(request: Request): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser()
    const { cursor, limit } = parseQuery(request, cursorPaginationSchema)

    const rows = await db.savedListing.findMany({
      where: {
        userId: user.id,
        // A listing the seller deleted or hid should not linger in saved.
        listing: {
          deletedAt: null,
          status: { in: ['ACTIVE', 'RESERVED', 'SOLD'] },
          seller: { status: 'ACTIVE', deletedAt: null },
        },
      },
      select: { id: true, listing: { select: listingCardSelect } },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    })

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows

    // Everything on this page is saved by definition, but likes are separate
    // state and still need one lookup so the hearts render correctly.
    const { likedIds } = await viewerInteractions(
      user.id,
      page.map((row) => row.listing.id),
    )
    const savedIds = new Set(page.map((row) => row.listing.id))

    return ok({
      listings: page.map((row) =>
        serializeListingCard(row.listing, { likedIds, savedIds }),
      ),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
      hasMore,
    })
  })
}
