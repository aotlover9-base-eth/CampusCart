import { NextResponse } from 'next/server'
import { z } from 'zod'
import { fail, handler, mutation, ok, parseBody } from '@/lib/api'
import { requireUser } from '@/lib/auth/context'
import { writeLimiter } from '@/lib/rate-limit'
import { db } from '@/lib/db'
import { formatPrice } from '@/lib/utils'
import { isBlockedBetween, messageSelect, serializeMessage } from '@/lib/conversations'
import { notify } from '@/lib/notifications'
import { publish } from '@/lib/realtime'

/**
 * GET  /api/offers - offers the caller made or received
 * POST /api/offers - make an offer on a listing
 *
 * An offer always lands in the thread as an OFFER message, so the negotiation
 * stays in one place rather than living in a separate inbox the seller has to
 * remember to check.
 */

export async function GET(request: Request): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser()
    const url = new URL(request.url)
    const role = url.searchParams.get('role') === 'seller' ? 'seller' : 'buyer'

    const offers = await db.offer.findMany({
      where:
        role === 'buyer'
          ? { buyerId: user.id }
          : { listing: { sellerId: user.id } },
      select: {
        id: true,
        amountInPaise: true,
        counterAmountInPaise: true,
        message: true,
        status: true,
        createdAt: true,
        respondedAt: true,
        conversationId: true,
        listing: {
          select: { id: true, title: true, priceInPaise: true, isFree: true, status: true },
        },
        buyer: { select: { id: true, fullName: true, avatarUrl: true, isVitVerified: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return ok({ offers })
  })
}

const createSchema = z.object({
  listingId: z.string().min(1),
  // Rupees in, paise stored - the same convention as listing prices.
  amountRupees: z.coerce.number().positive().max(1_000_000),
  message: z.string().trim().max(500).optional(),
})

export async function POST(request: Request): Promise<NextResponse> {
  return mutation(async () => {
    const user = await requireUser()

    const limit = await writeLimiter(user.id, 'offer')
    if (!limit.allowed) {
      return fail('You are making offers too quickly.', 429)
    }

    const body = await parseBody(request, createSchema)

    const listing = await db.listing.findFirst({
      where: { id: body.listingId, deletedAt: null },
      select: {
        id: true,
        sellerId: true,
        status: true,
        title: true,
        isFree: true,
        isNegotiable: true,
        priceInPaise: true,
      },
    })

    if (!listing) return fail('Listing not found', 404)
    if (listing.sellerId === user.id) return fail('This is your own listing', 400)
    if (!['ACTIVE', 'RESERVED'].includes(listing.status)) {
      return fail('This listing is no longer available', 409)
    }
    if (listing.isFree) return fail('This item is free - just message the seller', 400)
    if (!listing.isNegotiable) return fail('The seller has set a fixed price', 400)

    if (await isBlockedBetween(user.id, listing.sellerId)) {
      return fail('You cannot make an offer on this listing', 403)
    }

    const amountInPaise = Math.round(body.amountRupees * 100)

    // Supersede any offer still awaiting a response, so a seller never sees two
    // live numbers from the same buyer on the same item.
    await db.offer.updateMany({
      where: { listingId: listing.id, buyerId: user.id, status: 'PENDING' },
      data: { status: 'WITHDRAWN', respondedAt: new Date() },
    })

    const conversation = await db.conversation.upsert({
      where: {
        listingId_buyerId_sellerId: {
          listingId: listing.id,
          buyerId: user.id,
          sellerId: listing.sellerId,
        },
      },
      update: { lastMessageAt: new Date() },
      create: {
        listingId: listing.id,
        buyerId: user.id,
        sellerId: listing.sellerId,
        members: { create: [{ userId: user.id }, { userId: listing.sellerId }] },
      },
      select: { id: true },
    })

    const { offer, message } = await db.$transaction(async (tx) => {
      const createdOffer = await tx.offer.create({
        data: {
          listingId: listing.id,
          buyerId: user.id,
          conversationId: conversation.id,
          amountInPaise,
          message: body.message ?? null,
          status: 'PENDING',
          // A stale offer shouldn't bind the buyer indefinitely.
          expiresAt: new Date(Date.now() + 7 * 86_400_000),
        },
        select: { id: true, amountInPaise: true, status: true, createdAt: true },
      })

      const createdMessage = await tx.message.create({
        data: {
          conversationId: conversation.id,
          senderId: user.id,
          kind: 'OFFER',
          body: body.message ?? null,
          offerId: createdOffer.id,
        },
        select: messageSelect,
      })

      const preview = `Offered ${formatPrice(amountInPaise)}`

      await tx.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: createdMessage.createdAt, lastMessagePreview: preview },
      })
      await tx.conversationMember.updateMany({
        where: { conversationId: conversation.id, userId: listing.sellerId },
        data: { unreadCount: { increment: 1 }, isArchived: false },
      })

      return { offer: createdOffer, message: createdMessage }
    })

    publish(`conversation:${conversation.id}`, {
      type: 'message',
      message: serializeMessage(message, listing.sellerId),
    })
    publish(`user:${listing.sellerId}`, {
      type: 'conversation-updated',
      conversationId: conversation.id,
    })

    void notify({
      userId: listing.sellerId,
      kind: 'OFFER_RECEIVED',
      title: `${formatPrice(amountInPaise)} offer`,
      body: `${user.fullName} offered on "${listing.title}"`,
      href: `/chats/${conversation.id}`,
      entityType: 'offer',
      entityId: offer.id,
      actorId: user.id,
    })

    return ok({ offer, conversationId: conversation.id }, { status: 201 })
  })
}
