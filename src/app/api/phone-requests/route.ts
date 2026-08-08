import { NextResponse } from 'next/server'
import { z } from 'zod'
import { fail, handler, mutation, ok, parseBody } from '@/lib/api'
import { requireUser } from '@/lib/auth/context'
import { writeLimiter } from '@/lib/rate-limit'
import { db } from '@/lib/db'
import { isBlockedBetween } from '@/lib/conversations'
import { notify } from '@/lib/notifications'
import { publish } from '@/lib/realtime'

/**
 * GET  /api/phone-requests — requests the caller sent or received
 * POST /api/phone-requests — ask a seller for their number
 *
 * A number is never returned by this route. Only the accepted-request check in
 * /api/user/[userId]/phone releases it, so a leak would need two independent
 * mistakes rather than one.
 */

export async function GET(request: Request): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser()
    const url = new URL(request.url)
    const role = url.searchParams.get('role') === 'buyer' ? 'buyer' : 'seller'

    const requests = await db.phoneRequest.findMany({
      where: role === 'buyer' ? { buyerId: user.id } : { sellerId: user.id },
      select: {
        id: true,
        status: true,
        message: true,
        createdAt: true,
        respondedAt: true,
        viaSubscription: true,
        listing: { select: { id: true, title: true } },
        buyer: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            isVitVerified: true,
            role: true,
            department: true,
          },
        },
        seller: { select: { id: true, fullName: true, avatarUrl: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 50,
    })

    return ok({ requests })
  })
}

const createSchema = z.object({
  listingId: z.string().min(1),
  message: z.string().trim().max(300).optional(),
})

export async function POST(request: Request): Promise<NextResponse> {
  return mutation(async () => {
    const user = await requireUser()

    const limit = await writeLimiter(user.id, 'phone-request')
    if (!limit.allowed) {
      return fail('You are sending too many requests.', 429)
    }

    const body = await parseBody(request, createSchema)

    const listing = await db.listing.findFirst({
      where: { id: body.listingId, deletedAt: null },
      select: { id: true, title: true, sellerId: true, status: true },
    })

    if (!listing) return fail('Listing not found', 404)
    if (listing.sellerId === user.id) return fail('This is your own listing', 400)
    if (await isBlockedBetween(user.id, listing.sellerId)) {
      return fail('You cannot contact this seller', 403)
    }

    const existing = await db.phoneRequest.findUnique({
      where: { listingId_buyerId: { listingId: listing.id, buyerId: user.id } },
      select: { id: true, status: true, revokedAt: true },
    })

    if (existing && existing.status === 'ACCEPTED' && !existing.revokedAt) {
      return ok({ request: existing, alreadyAccepted: true })
    }
    if (existing && existing.status === 'PENDING') {
      return ok({ request: existing, alreadyPending: true })
    }

    // The seller's own setting decides whether approval is manual. Subscription
    // auto-accept lands here later; a seller who requires approval is never
    // auto-accepted regardless of what the buyer has paid for.
    const sellerSettings = await db.userSettings.findUnique({
      where: { userId: listing.sellerId },
      select: { requirePhoneApproval: true },
    })
    const requiresApproval = sellerSettings?.requirePhoneApproval ?? true

    const created = await db.phoneRequest.upsert({
      where: { listingId_buyerId: { listingId: listing.id, buyerId: user.id } },
      update: {
        status: 'PENDING',
        message: body.message ?? null,
        respondedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 14 * 86_400_000),
      },
      create: {
        listingId: listing.id,
        buyerId: user.id,
        sellerId: listing.sellerId,
        status: 'PENDING',
        message: body.message ?? null,
        expiresAt: new Date(Date.now() + 14 * 86_400_000),
      },
      select: { id: true, status: true, createdAt: true },
    })

    void notify({
      userId: listing.sellerId,
      kind: 'PHONE_REQUEST_RECEIVED',
      title: 'Someone wants your number',
      body: `${user.fullName} asked about "${listing.title}"`,
      href: '/notifications',
      entityType: 'phoneRequest',
      entityId: created.id,
      actorId: user.id,
    })

    publish(`user:${listing.sellerId}`, { type: 'phone-request', requestId: created.id })

    return ok({ request: created, requiresApproval }, { status: 201 })
  })
}
