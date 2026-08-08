import { NextResponse } from 'next/server'
import { fail, mutation, ok } from '@/lib/api'
import { requireUser } from '@/lib/auth/context'
import { db } from '@/lib/db'

/**
 * POST   /api/listings/[listingId]/save — save to the user's collection
 * DELETE /api/listings/[listingId]/save — unsave
 *
 * Saving is private: unlike a like, it never notifies the seller.
 */

interface Props {
  params: Promise<{ listingId: string }>
}

export async function POST(_request: Request, props: Props): Promise<NextResponse> {
  return mutation(async () => {
    const { listingId } = await props.params
    const user = await requireUser()

    const listing = await db.listing.findFirst({
      where: { id: listingId, deletedAt: null, status: { in: ['ACTIVE', 'RESERVED', 'SOLD'] } },
      select: { id: true },
    })

    if (!listing) return fail('Listing not found', 404)

    try {
      await db.$transaction([
        db.savedListing.create({ data: { listingId, userId: user.id } }),
        db.listing.update({
          where: { id: listingId },
          data: { saveCount: { increment: 1 } },
        }),
      ])
    } catch {
      // Already saved.
    }

    const updated = await db.listing.findUnique({
      where: { id: listingId },
      select: { saveCount: true },
    })

    return ok({ saved: true, saveCount: updated?.saveCount ?? 0 })
  })
}

export async function DELETE(_request: Request, props: Props): Promise<NextResponse> {
  return mutation(async () => {
    const { listingId } = await props.params
    const user = await requireUser()

    const existing = await db.savedListing.findUnique({
      where: { listingId_userId: { listingId, userId: user.id } },
      select: { id: true },
    })

    if (!existing) {
      const listing = await db.listing.findUnique({
        where: { id: listingId },
        select: { saveCount: true },
      })
      return ok({ saved: false, saveCount: listing?.saveCount ?? 0 })
    }

    const [, updated] = await db.$transaction([
      db.savedListing.delete({ where: { id: existing.id } }),
      db.listing.update({
        where: { id: listingId },
        data: { saveCount: { decrement: 1 } },
        select: { saveCount: true },
      }),
    ])

    return ok({ saved: false, saveCount: Math.max(0, updated.saveCount) })
  })
}
