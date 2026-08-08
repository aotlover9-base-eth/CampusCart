import { NextResponse } from 'next/server'
import type { Prisma } from '@/generated/prisma/client'
import { fail, handler, mutation, ok, parseBody, parseQuery } from '@/lib/api'
import { currentUser, requireUser } from '@/lib/auth/context'
import { createListingSchema, feedQuerySchema } from '@/lib/validation'
import { writeLimiter } from '@/lib/rate-limit'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import {
  decodeCursor,
  encodeCursor,
  listingCardSelect,
  serializeListingCard,
  viewerInteractions,
  visibilityWhere,
} from '@/lib/listings'

/**
 * GET  /api/listings — the marketplace feed, with filters, sort, and pagination
 * POST /api/listings — create a listing
 */

export async function GET(request: Request): Promise<NextResponse> {
  return handler(async () => {
    const query = parseQuery(request, feedQuerySchema)
    const viewer = await currentUser()

    const where: Prisma.ListingWhereInput = { ...visibilityWhere(viewer?.id) }
    const and: Prisma.ListingWhereInput[] = []

    if (query.sellerId) and.push({ sellerId: query.sellerId })

    // Narrowing to one state, e.g. the "Sold" tab on a profile. The schema
    // already restricts this to publicly-visible states, so it can only ever
    // subtract from what visibilityWhere permits.
    if (query.status) {
      and.push({ status: query.status as Prisma.EnumListingStatusFilter['equals'] })
    }

    if (query.category) {
      // Accept a slug and match the category or any of its children, so
      // "electronics" returns laptops and mobiles too.
      and.push({
        category: {
          OR: [{ slug: query.category }, { parent: { slug: query.category } }],
        },
      })
    }

    if (query.condition?.length) {
      and.push({ condition: { in: query.condition as Prisma.EnumListingConditionFilter['in'] } })
    }

    if (query.freeOnly) {
      and.push({ isFree: true })
    } else {
      if (query.minPrice != null) and.push({ priceInPaise: { gte: Math.round(query.minPrice * 100) } })
      if (query.maxPrice != null) and.push({ priceInPaise: { lte: Math.round(query.maxPrice * 100) } })
    }

    if (query.negotiable != null) and.push({ isNegotiable: query.negotiable })
    if (query.hostelBlock) and.push({ hostelBlock: query.hostelBlock })
    // Lets a day scholar browse only off-campus handovers, and vice versa.
    if (query.pickupArea) and.push({ pickupArea: query.pickupArea })

    if (query.sellerRole?.length) {
      and.push({ seller: { role: { in: query.sellerRole as Prisma.EnumUserRoleFilter['in'] } } })
    }

    if (query.vitVerifiedOnly) and.push({ seller: { isVitVerified: true } })

    if (query.q) {
      // Case-insensitive contains across title and description. Trigram-backed
      // fuzzy ranking lives in /api/search; this is the simple filter path.
      and.push({
        OR: [
          { title: { contains: query.q, mode: 'insensitive' } },
          { description: { contains: query.q, mode: 'insensitive' } },
          { customCategoryLabel: { contains: query.q, mode: 'insensitive' } },
        ],
      })
    }

    if (and.length > 0) where.AND = and

    // Distance sort needs every candidate in memory to rank, so it is bounded
    // by a radius filter and a hard cap rather than cursor-paginated.
    const isDistanceSort = query.sort === 'distance' && query.lat != null && query.lng != null

    if (isDistanceSort) {
      const radius = query.radiusKm ?? 25
      // Pre-filter with a bounding box so the DB does the coarse work; the exact
      // haversine ranking happens after.
      const latDelta = radius / 111
      const lngDelta = radius / (111 * Math.cos((query.lat! * Math.PI) / 180) || 1)

      and.push({
        latitude: { gte: query.lat! - latDelta, lte: query.lat! + latDelta },
        longitude: { gte: query.lng! - lngDelta, lte: query.lng! + lngDelta },
      })
      where.AND = and

      const rows = await db.listing.findMany({
        where,
        select: listingCardSelect,
        take: 200,
      })

      const interactions = await viewerInteractions(viewer?.id, rows.map((r) => r.id))
      const serialized = rows
        .map((row) =>
          serializeListingCard(row, {
            lat: query.lat,
            lng: query.lng,
            ...interactions,
          }),
        )
        .filter((row) => row.distanceKm != null && row.distanceKm <= radius)
        .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
        .slice(0, query.limit)

      return ok({ listings: serialized, nextCursor: null, hasMore: false })
    }

    const orderBy = buildOrderBy(query.sort)
    const cursor = decodeCursor(query.cursor)

    if (cursor) {
      const keysetFilter = buildKeysetFilter(query.sort, cursor)
      if (keysetFilter) {
        where.AND = [...(where.AND as Prisma.ListingWhereInput[]), keysetFilter]
      }
    }

    // Fetch one extra row to determine hasMore without a second count query.
    const rows = await db.listing.findMany({
      where,
      select: listingCardSelect,
      orderBy,
      take: query.limit + 1,
    })

    const hasMore = rows.length > query.limit
    const page = hasMore ? rows.slice(0, query.limit) : rows

    const interactions = await viewerInteractions(viewer?.id, page.map((r) => r.id))

    const listings = page.map((row) =>
      serializeListingCard(row, { lat: query.lat, lng: query.lng, ...interactions }),
    )

    const last = page[page.length - 1]
    const nextCursor =
      hasMore && last ? encodeCursor({ sortValue: cursorValue(query.sort, last), id: last.id }) : null

    return ok({ listings, nextCursor, hasMore })
  })
}

function buildOrderBy(sort: string): Prisma.ListingOrderByWithRelationInput[] {
  // `id` is the tiebreaker on every sort so the keyset cursor is deterministic.
  switch (sort) {
    case 'oldest':
      return [{ publishedAt: 'asc' }, { id: 'asc' }]
    case 'price_low':
      return [{ priceInPaise: 'asc' }, { id: 'asc' }]
    case 'price_high':
      return [{ priceInPaise: 'desc' }, { id: 'desc' }]
    case 'popular':
      return [{ viewCount: 'desc' }, { id: 'desc' }]
    default:
      return [{ publishedAt: 'desc' }, { id: 'desc' }]
  }
}

function cursorValue(sort: string, row: { publishedAt: Date | null; priceInPaise: number; viewCount: number }): string | number {
  switch (sort) {
    case 'price_low':
    case 'price_high':
      return row.priceInPaise
    case 'popular':
      return row.viewCount
    default:
      return (row.publishedAt ?? new Date(0)).toISOString()
  }
}

/**
 * Keyset predicate: "strictly after the cursor row" in the active sort order,
 * falling back to the id tiebreaker when the sort value ties.
 */
function buildKeysetFilter(
  sort: string,
  cursor: { sortValue: string | number; id: string },
): Prisma.ListingWhereInput | null {
  const { sortValue, id } = cursor

  switch (sort) {
    case 'oldest':
      return {
        OR: [
          { publishedAt: { gt: new Date(String(sortValue)) } },
          { publishedAt: new Date(String(sortValue)), id: { gt: id } },
        ],
      }
    case 'price_low':
      return {
        OR: [
          { priceInPaise: { gt: Number(sortValue) } },
          { priceInPaise: Number(sortValue), id: { gt: id } },
        ],
      }
    case 'price_high':
      return {
        OR: [
          { priceInPaise: { lt: Number(sortValue) } },
          { priceInPaise: Number(sortValue), id: { lt: id } },
        ],
      }
    case 'popular':
      return {
        OR: [
          { viewCount: { lt: Number(sortValue) } },
          { viewCount: Number(sortValue), id: { lt: id } },
        ],
      }
    case 'newest':
      return {
        OR: [
          { publishedAt: { lt: new Date(String(sortValue)) } },
          { publishedAt: new Date(String(sortValue)), id: { lt: id } },
        ],
      }
    default:
      return null
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  return mutation(async () => {
    const user = await requireUser()

    const limit = await writeLimiter(user.id, 'listing')
    if (!limit.allowed) {
      return fail('You are posting too quickly. Try again in a minute.', 429)
    }

    const body = await parseBody(request, createListingSchema)

    const category = await db.category.findUnique({
      where: { id: body.categoryId },
      select: { id: true, isActive: true, allowsCustomLabel: true },
    })

    if (!category || !category.isActive) {
      return fail('That category is unavailable', 400, { categoryId: 'Pick a valid category' })
    }

    if (body.customCategoryLabel && !category.allowsCustomLabel) {
      return fail('This category does not accept a custom label', 400, {
        customCategoryLabel: 'Not allowed here',
      })
    }

    if (category.allowsCustomLabel && !body.customCategoryLabel) {
      return fail('Describe the category in a word or two', 400, {
        customCategoryLabel: 'Required for "Other"',
      })
    }

    // Approval gating is a flag, default off — listings publish instantly.
    const approvalRequired = env().FEATURE_LISTING_APPROVAL
    const status = !body.publish
      ? 'DRAFT'
      : approvalRequired
        ? 'PENDING_APPROVAL'
        : 'ACTIVE'

    const priceInPaise = body.isFree ? 0 : Math.round(body.priceRupees * 100)

    const listing = await db.$transaction(async (tx) => {
      const created = await tx.listing.create({
        data: {
          sellerId: user.id,
          title: body.title,
          description: body.description,
          priceInPaise,
          isFree: body.isFree,
          isNegotiable: body.isFree ? false : body.isNegotiable,
          condition: body.condition,
          categoryId: body.categoryId,
          customCategoryLabel: body.customCategoryLabel ?? null,
          contactPreference: body.contactPreference,
          availabilityNote: body.availabilityNote ?? null,
          locationLabel: body.locationLabel ?? null,
          hostelBlock: body.hostelBlock ?? null,
          pickupArea: body.pickupArea,
          latitude: body.latitude ?? null,
          longitude: body.longitude ?? null,
          googleMapsUrl: body.googleMapsUrl ?? null,
          status,
          publishedAt: status === 'ACTIVE' ? new Date() : null,
          media: {
            create: body.media.map((m, index) => ({
              kind: m.kind,
              storageKey: m.storageKey,
              thumbnailKey: m.thumbnailKey ?? null,
              mimeType: m.mimeType,
              sizeBytes: m.sizeBytes,
              width: m.width ?? null,
              height: m.height ?? null,
              durationMs: m.durationMs ?? null,
              blurDataUrl: m.blurDataUrl ?? null,
              altText: m.altText ?? null,
              sortOrder: index,
            })),
          },
        },
        select: listingCardSelect,
      })

      // Only live listings count toward the seller's public total.
      if (status === 'ACTIVE') {
        await tx.user.update({
          where: { id: user.id },
          data: { listingCount: { increment: 1 } },
        })
      }

      return created
    })

    return ok(
      {
        listing: serializeListingCard(listing),
        status,
        pendingApproval: status === 'PENDING_APPROVAL',
      },
      { status: 201 },
    )
  })
}
