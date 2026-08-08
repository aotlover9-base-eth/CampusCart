import { NextResponse } from 'next/server'
import { fail, handler, ok } from '@/lib/api'
import { requireUser } from '@/lib/auth/context'
import { db } from '@/lib/db'

/**
 * GET /api/user/[userId]/phone?listing=<id>
 *
 * The only route in the application that returns another user's phone number.
 *
 * Access requires an ACCEPTED, un-revoked, unexpired PhoneRequest from the
 * caller to this user for this specific listing. Access is per-listing on
 * purpose: approving a buyer for one item is not consent to be called about
 * everything else.
 */

interface Props {
  params: Promise<{ userId: string }>
}

export async function GET(request: Request, props: Props): Promise<NextResponse> {
  return handler(async () => {
    const viewer = await requireUser()
    const { userId } = await props.params

    // Your own number is always yours to read.
    if (userId === viewer.id) {
      return ok({ phone: viewer.phone, source: 'self' as const })
    }

    const listingId = new URL(request.url).searchParams.get('listing')
    if (!listingId) {
      return fail('Specify which listing this is about', 400)
    }

    const grant = await db.phoneRequest.findUnique({
      where: { listingId_buyerId: { listingId, buyerId: viewer.id } },
      select: {
        status: true,
        revokedAt: true,
        expiresAt: true,
        sellerId: true,
        seller: { select: { id: true, phone: true, status: true, deletedAt: true } },
      },
    })

    // Every failure below returns the same 403, so the response cannot be used
    // to distinguish "never asked" from "was rejected" from "was revoked".
    const denied = () => fail('The seller has not shared their number with you', 403)

    if (!grant) return denied()
    if (grant.sellerId !== userId) return denied()
    if (grant.status !== 'ACCEPTED') return denied()
    if (grant.revokedAt) return denied()
    if (grant.expiresAt && grant.expiresAt < new Date()) return denied()
    if (!grant.seller || grant.seller.deletedAt || grant.seller.status !== 'ACTIVE') {
      return denied()
    }

    return ok({ phone: grant.seller.phone, source: 'granted' as const })
  })
}
