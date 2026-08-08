import { NextResponse } from 'next/server'
import { fail, mutation, ok, parseBody } from '@/lib/api'
import { requireUser } from '@/lib/auth/context'
import { listingStatusActionSchema } from '@/lib/validation'
import { db } from '@/lib/db'
import { env } from '@/lib/env'

/**
 * POST /api/listings/[listingId]/status
 *
 * Seller-only lifecycle transitions: publish, unpublish, mark sold, relist.
 * Kept separate from PATCH so the UI can fire a one-tap "Mark sold" without
 * resending the whole listing.
 */

interface Props {
  params: Promise<{ listingId: string }>
}

export async function POST(request: Request, props: Props): Promise<NextResponse> {
  return mutation(async () => {
    const { listingId } = await props.params
    const user = await requireUser()
    const { action, soldToId } = await parseBody(request, listingStatusActionSchema)

    const listing = await db.listing.findFirst({
      where: { id: listingId, deletedAt: null },
      select: { id: true, sellerId: true, status: true },
    })

    if (!listing) return fail('Listing not found', 404)
    if (listing.sellerId !== user.id) {
      return fail('You can only change your own listings', 403)
    }
    if (listing.status === 'REMOVED') {
      return fail('This listing was removed by moderation', 403)
    }

    // A buyer named as the purchaser must actually exist.
    if (action === 'mark_sold' && soldToId) {
      const buyer = await db.user.findFirst({
        where: { id: soldToId, status: 'ACTIVE', deletedAt: null },
        select: { id: true },
      })
      if (!buyer) return fail('That buyer account was not found', 400)
    }

    const wasLive = listing.status === 'ACTIVE'

    const { status, publishedAt, soldAt } = resolveTransition(action, listing.status)
    if (!status) {
      return fail(`Cannot ${action.replace('_', ' ')} a listing that is ${listing.status}`, 409)
    }

    const updated = await db.$transaction(async (tx) => {
      const result = await tx.listing.update({
        where: { id: listingId },
        data: {
          status,
          ...(publishedAt !== undefined ? { publishedAt } : {}),
          ...(soldAt !== undefined ? { soldAt } : {}),
          ...(action === 'mark_sold' ? { soldToId: soldToId ?? null } : {}),
          ...(action === 'mark_available' ? { soldToId: null } : {}),
        },
        select: { id: true, status: true, publishedAt: true, soldAt: true },
      })

      // Keep the seller's public counters honest across every transition.
      const nowLive = status === 'ACTIVE'
      if (wasLive !== nowLive) {
        await tx.user.update({
          where: { id: user.id },
          data: { listingCount: nowLive ? { increment: 1 } : { decrement: 1 } },
        })
      }

      if (action === 'mark_sold') {
        await tx.user.update({
          where: { id: user.id },
          data: { soldCount: { increment: 1 } },
        })
      } else if (action === 'mark_available' && listing.status === 'SOLD') {
        await tx.user.update({
          where: { id: user.id },
          data: { soldCount: { decrement: 1 } },
        })
      }

      return result
    })

    // Tell the buyer their purchase is confirmed.
    if (action === 'mark_sold' && soldToId) {
      await db.notification
        .create({
          data: {
            userId: soldToId,
            kind: 'LISTING_SOLD',
            title: 'Purchase confirmed',
            body: 'The seller marked this listing as sold to you.',
            href: `/listing/${listingId}`,
            entityType: 'listing',
            entityId: listingId,
            actorId: user.id,
          },
        })
        .catch(() => null)
    }

    return ok({ listing: updated })
  })
}

/**
 * Legal transitions. Returns an empty status when the requested action does not
 * apply to the current state, which the caller turns into a 409.
 */
function resolveTransition(
  action: 'publish' | 'unpublish' | 'mark_sold' | 'mark_available',
  current: string,
): { status?: 'ACTIVE' | 'HIDDEN' | 'SOLD' | 'PENDING_APPROVAL'; publishedAt?: Date | null; soldAt?: Date | null } {
  switch (action) {
    case 'publish': {
      if (!['DRAFT', 'HIDDEN'].includes(current)) return {}
      // Respect the approval flag on the way live.
      const status = env().FEATURE_LISTING_APPROVAL ? 'PENDING_APPROVAL' : 'ACTIVE'
      return { status, publishedAt: status === 'ACTIVE' ? new Date() : null }
    }
    case 'unpublish':
      if (!['ACTIVE', 'RESERVED', 'PENDING_APPROVAL'].includes(current)) return {}
      return { status: 'HIDDEN' }
    case 'mark_sold':
      if (!['ACTIVE', 'RESERVED'].includes(current)) return {}
      return { status: 'SOLD', soldAt: new Date() }
    case 'mark_available':
      if (!['SOLD', 'HIDDEN'].includes(current)) return {}
      return { status: 'ACTIVE', soldAt: null, publishedAt: new Date() }
    default:
      return {}
  }
}
