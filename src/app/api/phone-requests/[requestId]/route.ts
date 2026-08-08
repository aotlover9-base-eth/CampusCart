import { NextResponse } from 'next/server'
import { z } from 'zod'
import { fail, mutation, ok, parseBody } from '@/lib/api'
import { requireUser } from '@/lib/auth/context'
import { db } from '@/lib/db'
import { notify } from '@/lib/notifications'
import { publish } from '@/lib/realtime'

/**
 * POST /api/phone-requests/[requestId] — accept, reject, or revoke.
 *
 * Revoking is what makes sharing reversible: an accepted request can be pulled
 * back at any time, and the number stops resolving for that buyer immediately.
 */

interface Props {
  params: Promise<{ requestId: string }>
}

const schema = z.object({
  action: z.enum(['accept', 'reject', 'revoke']),
})

export async function POST(request: Request, props: Props): Promise<NextResponse> {
  return mutation(async () => {
    const user = await requireUser()
    const { requestId } = await props.params
    const { action } = await parseBody(request, schema)

    const phoneRequest = await db.phoneRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        status: true,
        sellerId: true,
        buyerId: true,
        revokedAt: true,
        listing: { select: { id: true, title: true } },
      },
    })

    if (!phoneRequest) return fail('Request not found', 404)
    // Only the seller controls their own number.
    if (phoneRequest.sellerId !== user.id) return fail('Request not found', 404)

    if (action === 'revoke') {
      if (phoneRequest.status !== 'ACCEPTED' || phoneRequest.revokedAt) {
        return fail('That request is not currently shared', 409)
      }

      await db.phoneRequest.update({
        where: { id: phoneRequest.id },
        data: { revokedAt: new Date() },
      })

      return ok({ status: 'REVOKED' })
    }

    if (phoneRequest.status !== 'PENDING') {
      return fail('This request has already been answered', 409)
    }

    const accepted = action === 'accept'

    await db.phoneRequest.update({
      where: { id: phoneRequest.id },
      data: {
        status: accepted ? 'ACCEPTED' : 'REJECTED',
        respondedAt: new Date(),
        revokedAt: null,
      },
    })

    void notify({
      userId: phoneRequest.buyerId,
      kind: accepted ? 'PHONE_REQUEST_ACCEPTED' : 'PHONE_REQUEST_REJECTED',
      title: accepted ? 'Number shared' : 'Request declined',
      body: accepted
        ? `${user.fullName} shared their number for "${phoneRequest.listing.title}"`
        : `${user.fullName} preferred to keep chatting in the app`,
      href: `/listing/${phoneRequest.listing.id}`,
      entityType: 'phoneRequest',
      entityId: phoneRequest.id,
      actorId: user.id,
    })

    publish(`user:${phoneRequest.buyerId}`, {
      type: 'phone-request-answered',
      requestId: phoneRequest.id,
      accepted,
    })

    return ok({ status: accepted ? 'ACCEPTED' : 'REJECTED' })
  })
}
