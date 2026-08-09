import { NextResponse } from 'next/server'
import { z } from 'zod'
import { fail, handler, mutation, ok, parseBody } from '@/lib/api'
import { requireUser } from '@/lib/auth/context'
import { writeLimiter } from '@/lib/rate-limit'
import { db } from '@/lib/db'
import {
  conversationListSelect,
  isBlockedBetween,
  serializeConversation,
} from '@/lib/conversations'

/**
 * GET  /api/conversations - the viewer's threads, newest activity first.
 * POST /api/conversations - open (or reopen) the thread for a listing.
 */

const PAGE_SIZE = 25

export async function GET(request: Request): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser()
    const url = new URL(request.url)

    const archived = url.searchParams.get('archived') === 'true'
    const query = url.searchParams.get('q')?.trim() ?? ''
    const cursor = url.searchParams.get('cursor') ?? undefined

    const memberships = await db.conversationMember.findMany({
      where: {
        userId: user.id,
        isArchived: archived,
        conversation: {
          // Search matches the listing title or the other participant's name.
          ...(query
            ? {
                OR: [
                  { listing: { title: { contains: query, mode: 'insensitive' } } },
                  { buyer: { fullName: { contains: query, mode: 'insensitive' } } },
                  { seller: { fullName: { contains: query, mode: 'insensitive' } } },
                ],
              }
            : {}),
        },
      },
      select: {
        unreadCount: true,
        isArchived: true,
        isMuted: true,
        conversation: { select: conversationListSelect },
      },
      orderBy: { conversation: { lastMessageAt: 'desc' } },
      take: PAGE_SIZE + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    })

    const hasMore = memberships.length > PAGE_SIZE
    const page = hasMore ? memberships.slice(0, PAGE_SIZE) : memberships

    return ok({
      conversations: page.map((row) =>
        serializeConversation(row.conversation, user.id, row),
      ),
      nextCursor: hasMore ? page.at(-1)?.conversation.id : null,
    })
  })
}

const createSchema = z.object({
  listingId: z.string().min(1),
})

export async function POST(request: Request): Promise<NextResponse> {
  return mutation(async () => {
    const user = await requireUser()

    const limit = await writeLimiter(user.id, 'conversation')
    if (!limit.allowed) {
      return fail('Slow down a little and try again.', 429)
    }

    const { listingId } = await parseBody(request, createSchema)

    const listing = await db.listing.findFirst({
      where: { id: listingId, deletedAt: null },
      select: { id: true, sellerId: true, status: true, title: true },
    })

    if (!listing) return fail('Listing not found', 404)
    if (listing.sellerId === user.id) {
      return fail('This is your own listing', 400)
    }
    if (!['ACTIVE', 'RESERVED'].includes(listing.status)) {
      return fail('This listing is no longer available', 409)
    }

    if (await isBlockedBetween(user.id, listing.sellerId)) {
      // Deliberately vague: the blocked user should not learn they were blocked.
      return fail('You cannot message this seller', 403)
    }

    // One thread per (listing, buyer, seller) triple - reuse it if it exists.
    const existing = await db.conversation.findFirst({
      where: { listingId: listing.id, buyerId: user.id, sellerId: listing.sellerId },
      select: conversationListSelect,
    })

    if (existing) {
      // Reopen it for the viewer if they had archived it.
      await db.conversationMember.updateMany({
        where: { conversationId: existing.id, userId: user.id, isArchived: true },
        data: { isArchived: false },
      })

      return ok({ conversation: serializeConversation(existing, user.id), created: false })
    }

    const created = await db.conversation.create({
      data: {
        listingId: listing.id,
        buyerId: user.id,
        sellerId: listing.sellerId,
        lastMessagePreview: null,
        members: {
          create: [{ userId: user.id }, { userId: listing.sellerId }],
        },
      },
      select: conversationListSelect,
    })

    await db.listing.update({
      where: { id: listing.id },
      data: { chatCount: { increment: 1 } },
    })

    return ok(
      { conversation: serializeConversation(created, user.id), created: true },
      { status: 201 },
    )
  })
}
