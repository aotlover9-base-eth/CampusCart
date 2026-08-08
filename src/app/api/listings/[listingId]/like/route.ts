import { NextResponse } from 'next/server'
import { fail, mutation, ok } from '@/lib/api'
import { requireUser } from '@/lib/auth/context'
import { db } from '@/lib/db'

/**
 * POST   /api/listings/[listingId]/like — like
 * DELETE /api/listings/[listingId]/like — unlike
 *
 * The unique (listingId, userId) constraint makes both idempotent, so a
 * double-tap or a retried request can't inflate the counter.
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
      select: { id: true, sellerId: true, title: true },
    })

    if (!listing) return fail('Listing not found', 404)

    try {
      await db.$transaction([
        db.listingLike.create({ data: { listingId, userId: user.id } }),
        db.listing.update({
          where: { id: listingId },
          data: { likeCount: { increment: 1 } },
        }),
      ])
    } catch {
      // Already liked — report the current state rather than an error.
      const likeCount = await db.listing
        .findUnique({ where: { id: listingId }, select: { likeCount: true } })
        .then((r) => r?.likeCount ?? 0)
      return ok({ liked: true, likeCount })
    }

    // Notify the seller, but never for a self-like.
    if (listing.sellerId !== user.id) {
      await db.notification
        .create({
          data: {
            userId: listing.sellerId,
            kind: 'LISTING_LIKED',
            title: 'Someone liked your listing',
            body: listing.title,
            href: `/listing/${listingId}`,
            entityType: 'listing',
            entityId: listingId,
            actorId: user.id,
          },
        })
        .catch(() => null)
    }

    const updated = await db.listing.findUnique({
      where: { id: listingId },
      select: { likeCount: true },
    })

    return ok({ liked: true, likeCount: updated?.likeCount ?? 0 })
  })
}

export async function DELETE(_request: Request, props: Props): Promise<NextResponse> {
  return mutation(async () => {
    const { listingId } = await props.params
    const user = await requireUser()

    const existing = await db.listingLike.findUnique({
      where: { listingId_userId: { listingId, userId: user.id } },
      select: { id: true },
    })

    if (!existing) {
      const listing = await db.listing.findUnique({
        where: { id: listingId },
        select: { likeCount: true },
      })
      return ok({ liked: false, likeCount: listing?.likeCount ?? 0 })
    }

    const [, updated] = await db.$transaction([
      db.listingLike.delete({ where: { id: existing.id } }),
      db.listing.update({
        where: { id: listingId },
        // Guard against a negative counter if rows ever drift.
        data: { likeCount: { decrement: 1 } },
        select: { likeCount: true },
      }),
    ])

    return ok({ liked: false, likeCount: Math.max(0, updated.likeCount) })
  })
}
