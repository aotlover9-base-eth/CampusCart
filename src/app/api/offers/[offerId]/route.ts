import { NextResponse } from 'next/server'
import { z } from 'zod'
import { fail, mutation, ok, parseBody } from '@/lib/api'
import { requireUser } from '@/lib/auth/context'
import { db } from '@/lib/db'
import { formatPrice } from '@/lib/utils'
import { messageSelect, serializeMessage } from '@/lib/conversations'
import { notify } from '@/lib/notifications'
import { publish } from '@/lib/realtime'

/**
 * POST /api/offers/[offerId] - respond to or withdraw an offer.
 *
 * Sellers accept, reject, or counter. Buyers may only withdraw their own.
 * Accepting reserves the listing rather than marking it sold: money and
 * handover still happen in person, so the seller confirms the sale separately.
 */

interface Props {
  params: Promise<{ offerId: string }>
}

const schema = z
  .object({
    action: z.enum(['accept', 'reject', 'counter', 'withdraw']),
    counterRupees: z.coerce.number().positive().max(1_000_000).optional(),
  })
  .refine((value) => value.action !== 'counter' || value.counterRupees != null, {
    message: 'Enter a counter amount',
    path: ['counterRupees'],
  })

export async function POST(request: Request, props: Props): Promise<NextResponse> {
  return mutation(async () => {
    const user = await requireUser()
    const { offerId } = await props.params
    const body = await parseBody(request, schema)

    const offer = await db.offer.findUnique({
      where: { id: offerId },
      select: {
        id: true,
        status: true,
        amountInPaise: true,
        buyerId: true,
        conversationId: true,
        listing: { select: { id: true, title: true, sellerId: true, status: true } },
        buyer: { select: { id: true, fullName: true } },
      },
    })

    if (!offer) return fail('Offer not found', 404)

    const isSeller = offer.listing.sellerId === user.id
    const isBuyer = offer.buyerId === user.id
    if (!isSeller && !isBuyer) return fail('Offer not found', 404)

    if (offer.status !== 'PENDING') {
      return fail('This offer has already been answered', 409)
    }

    // Withdrawing is the buyer's only move; the rest belong to the seller.
    if (body.action === 'withdraw' ? !isBuyer : !isSeller) {
      return fail('You cannot do that with this offer', 403)
    }

    const now = new Date()
    const counterInPaise = body.counterRupees ? Math.round(body.counterRupees * 100) : null

    const nextStatus = {
      accept: 'ACCEPTED',
      reject: 'REJECTED',
      counter: 'COUNTERED',
      withdraw: 'WITHDRAWN',
    }[body.action] as 'ACCEPTED' | 'REJECTED' | 'COUNTERED' | 'WITHDRAWN'

    const systemBody = {
      accept: `Offer accepted - ${formatPrice(offer.amountInPaise)}`,
      reject: 'Offer declined',
      counter: `Countered with ${counterInPaise ? formatPrice(counterInPaise) : ''}`,
      withdraw: 'Offer withdrawn',
    }[body.action]

    const message = await db.$transaction(async (tx) => {
      await tx.offer.update({
        where: { id: offer.id },
        data: {
          status: nextStatus,
          respondedAt: now,
          ...(counterInPaise ? { counterAmountInPaise: counterInPaise } : {}),
        },
      })

      // Accepting holds the item for this buyer. It becomes SOLD only when the
      // seller confirms the handover from the listing page.
      if (body.action === 'accept' && offer.listing.status === 'ACTIVE') {
        await tx.listing.update({
          where: { id: offer.listing.id },
          data: { status: 'RESERVED' },
        })
      }

      if (!offer.conversationId) return null

      const created = await tx.message.create({
        data: {
          conversationId: offer.conversationId,
          senderId: user.id,
          kind: 'SYSTEM',
          body: systemBody,
          offerId: offer.id,
        },
        select: messageSelect,
      })

      await tx.conversation.update({
        where: { id: offer.conversationId },
        data: { lastMessageAt: created.createdAt, lastMessagePreview: systemBody },
      })

      const otherId = isSeller ? offer.buyerId : offer.listing.sellerId
      await tx.conversationMember.updateMany({
        where: { conversationId: offer.conversationId, userId: otherId },
        data: { unreadCount: { increment: 1 }, isArchived: false },
      })

      return created
    })

    const recipientId = isSeller ? offer.buyerId : offer.listing.sellerId

    if (message && offer.conversationId) {
      publish(`conversation:${offer.conversationId}`, {
        type: 'message',
        message: serializeMessage(message, recipientId),
      })
      publish(`user:${recipientId}`, {
        type: 'conversation-updated',
        conversationId: offer.conversationId,
      })
    }

    // Only the seller's decisions are worth a notification; a withdrawal is not.
    if (body.action === 'accept' || body.action === 'reject' || body.action === 'counter') {
      void notify({
        userId: offer.buyerId,
        kind: body.action === 'accept' ? 'OFFER_ACCEPTED' : 'OFFER_REJECTED',
        title: systemBody,
        body: offer.listing.title,
        href: offer.conversationId ? `/chats/${offer.conversationId}` : `/listing/${offer.listing.id}`,
        entityType: 'offer',
        entityId: offer.id,
        actorId: user.id,
      })
    }

    return ok({ status: nextStatus, counterAmountInPaise: counterInPaise })
  })
}
