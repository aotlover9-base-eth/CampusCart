import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { Prisma } from '@/generated/prisma/client'
import { fail, handler, mutation, ok, parseBody, parseQuery } from '@/lib/api'
import { auditLog, requireAdmin, requireAdminRole } from '@/lib/admin/auth'
import { cursorPaginationSchema } from '@/lib/validation'
import { db } from '@/lib/db'
import { storage } from '@/lib/storage'
import { notify } from '@/lib/notifications'

/**
 * GET   /api/admin/listings - search and page through listings
 * PATCH /api/admin/listings - approve, remove, restore, feature, or delete
 */

const querySchema = cursorPaginationSchema.extend({
  q: z.string().trim().max(120).optional(),
  status: z
    .enum(['DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'SOLD', 'RESERVED', 'HIDDEN', 'REMOVED'])
    .optional(),
  reported: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
})

export async function GET(request: Request): Promise<NextResponse> {
  return handler(async () => {
    await requireAdmin()
    const { cursor, limit, q, status, reported } = parseQuery(request, querySchema)
    const store = storage()

    const where: Prisma.ListingWhereInput = {
      ...(status ? { status } : {}),
      ...(reported ? { reports: { some: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } } } : {}),
      ...(q ? { title: { contains: q, mode: 'insensitive' } } : {}),
    }

    const rows = await db.listing.findMany({
      where,
      select: {
        id: true,
        title: true,
        priceInPaise: true,
        isFree: true,
        status: true,
        isFeatured: true,
        viewCount: true,
        createdAt: true,
        deletedAt: true,
        seller: { select: { id: true, fullName: true, avatarUrl: true } },
        media: {
          orderBy: { sortOrder: 'asc' },
          take: 1,
          select: { storageKey: true, thumbnailKey: true },
        },
        _count: { select: { reports: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    })

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows

    return ok({
      listings: page.map((listing) => {
        const cover = listing.media[0]
        return {
          id: listing.id,
          title: listing.title,
          priceInPaise: listing.priceInPaise,
          isFree: listing.isFree,
          status: listing.status,
          isFeatured: listing.isFeatured,
          viewCount: listing.viewCount,
          reportCount: listing._count.reports,
          seller: listing.seller,
          thumbnailUrl: cover ? store.url(cover.thumbnailKey ?? cover.storageKey) : null,
          createdAt: listing.createdAt.toISOString(),
          isDeleted: listing.deletedAt !== null,
        }
      }),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
      hasMore,
    })
  })
}

const patchSchema = z.object({
  listingId: z.string().min(1),
  action: z.enum(['approve', 'remove', 'restore', 'feature', 'unfeature', 'delete']),
  reason: z.string().trim().max(300).optional(),
})

export async function PATCH(request: Request): Promise<NextResponse> {
  return mutation(async () => {
    const body = await parseBody(request, patchSchema)

    const admin =
      body.action === 'delete'
        ? await requireAdminRole()
        : await requireAdminRole('MODERATOR', 'SUPPORT')

    const before = await db.listing.findUnique({
      where: { id: body.listingId },
      select: { id: true, title: true, status: true, isFeatured: true, sellerId: true },
    })
    if (!before) return fail('Listing not found', 404)

    const data: Prisma.ListingUpdateInput = {}
    let summary = ''

    switch (body.action) {
      case 'approve':
        data.status = 'ACTIVE'
        data.publishedAt = new Date()
        summary = `Approved "${before.title}"`
        break
      case 'remove':
        data.status = 'REMOVED'
        summary = `Removed "${before.title}"`
        break
      case 'restore':
        data.status = 'ACTIVE'
        data.deletedAt = null
        summary = `Restored "${before.title}"`
        break
      case 'feature':
        data.isFeatured = true
        // Featured placement expires on its own rather than needing a sweep.
        data.featuredTill = new Date(Date.now() + 7 * 86_400_000)
        summary = `Featured "${before.title}"`
        break
      case 'unfeature':
        data.isFeatured = false
        data.featuredTill = null
        summary = `Unfeatured "${before.title}"`
        break
      case 'delete':
        data.deletedAt = new Date()
        data.status = 'REMOVED'
        summary = `Deleted "${before.title}"`
        break
    }

    await db.listing.update({ where: { id: body.listingId }, data })

    // Tell the seller when their listing is taken down or goes live, so a
    // moderation decision is never silent.
    if (body.action === 'remove' || body.action === 'delete') {
      void notify({
        userId: before.sellerId,
        kind: 'LISTING_REMOVED',
        title: 'Listing removed',
        body: body.reason
          ? `"${before.title}" was removed: ${body.reason}`
          : `"${before.title}" was removed by a moderator.`,
        entityType: 'listing',
        entityId: before.id,
      })
    }

    if (body.action === 'approve') {
      void notify({
        userId: before.sellerId,
        kind: 'LISTING_APPROVED',
        title: 'Listing approved',
        body: `"${before.title}" is now live.`,
        href: `/listing/${before.id}`,
        entityType: 'listing',
        entityId: before.id,
      })
    }

    void auditLog({
      adminId: admin.id,
      action: `listing.${body.action}`,
      entityType: 'listing',
      entityId: body.listingId,
      summary,
      metadata: {
        before: { status: before.status, isFeatured: before.isFeatured },
        reason: body.reason ?? null,
      },
    })

    return ok({ updated: true })
  })
}
