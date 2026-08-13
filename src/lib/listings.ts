import type { Prisma } from '@/generated/prisma/client'
import { db } from './db'
import { storage } from './storage'
import { haversineKm } from './utils'

/**
 * Listing read helpers shared by the feed, search, and detail routes.
 *
 * One selection shape is used everywhere so a field can never leak from one
 * endpoint but not another. Seller phone numbers are absent by construction -
 * they are only ever returned by the phone-request route in Phase 3.
 */

export const listingCardSelect = {
  id: true,
  title: true,
  priceInPaise: true,
  isFree: true,
  isNegotiable: true,
  condition: true,
  status: true,
  locationLabel: true,
  hostelBlock: true,
  pickupArea: true,
  latitude: true,
  longitude: true,
  viewCount: true,
  likeCount: true,
  saveCount: true,
  isFeatured: true,
  publishedAt: true,
  createdAt: true,
  soldAt: true,
  customCategoryLabel: true,
  category: {
    select: { id: true, name: true, slug: true, icon: true },
  },
  seller: {
    select: {
      id: true,
      fullName: true,
      avatarUrl: true,
      role: true,
      isVitVerified: true,
      isOnline: true,
      lastSeenAt: true,
    },
  },
  media: {
    orderBy: { sortOrder: 'asc' },
    take: 1,
    select: {
      id: true,
      kind: true,
      storageKey: true,
      thumbnailKey: true,
      blurDataUrl: true,
      width: true,
      height: true,
      altText: true,
      sortOrder: true,
    },
  },
} satisfies Prisma.ListingSelect

export type ListingCardRow = Prisma.ListingGetPayload<{ select: typeof listingCardSelect }>

/** Resolve storage keys to URLs and shape a row for the client. */
export function serializeListingCard(
  row: ListingCardRow,
  viewer?: { lat?: number; lng?: number; likedIds?: Set<string>; savedIds?: Set<string> },
) {
  const store = storage()

  const distanceKm =
    viewer?.lat != null && viewer.lng != null && row.latitude != null && row.longitude != null
      ? haversineKm(
          { lat: viewer.lat, lng: viewer.lng },
          { lat: row.latitude, lng: row.longitude },
        )
      : null

  return {
    id: row.id,
    title: row.title,
    priceInPaise: row.priceInPaise,
    isFree: row.isFree,
    isNegotiable: row.isNegotiable,
    condition: row.condition,
    status: row.status,
    // Exact coordinates are withheld from cards; only the label and a derived
    // distance are public. The precise pickup point is shared in chat.
    locationLabel: row.locationLabel,
    hostelBlock: row.hostelBlock,
    pickupArea: row.pickupArea,
    distanceKm,
    viewCount: row.viewCount,
    likeCount: row.likeCount,
    saveCount: row.saveCount,
    isFeatured: row.isFeatured,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    soldAt: row.soldAt,
    category: {
      ...row.category,
      // A custom label overrides the generic "Other" name for display.
      displayName: row.customCategoryLabel ?? row.category.name,
    },
    seller: row.seller,
    media: row.media.map((m) => ({
      id: m.id,
      kind: m.kind,
      url: store.url(m.storageKey),
      thumbnailUrl: m.thumbnailKey ? store.url(m.thumbnailKey) : store.url(m.storageKey),
      blurDataUrl: m.blurDataUrl,
      width: m.width,
      height: m.height,
      altText: m.altText,
    })),
    isLiked: viewer?.likedIds?.has(row.id) ?? false,
    isSaved: viewer?.savedIds?.has(row.id) ?? false,
  }
}

export type SerializedListingCard = ReturnType<typeof serializeListingCard>

/**
 * Opaque cursor encoding. Keyset pagination beats offset here: the feed is
 * write-heavy, and OFFSET would skip or repeat rows as listings are posted.
 */
export function encodeCursor(value: { sortValue: string | number; id: string }): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

export function decodeCursor(
  cursor: string | undefined,
): { sortValue: string | number; id: string } | null {
  if (!cursor) return null
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (typeof parsed?.id !== 'string' || parsed.sortValue == null) return null
    return parsed
  } catch {
    return null
  }
}

/** Which listings a given viewer is allowed to see in a feed. */
export function visibilityWhere(viewerId?: string): Prisma.ListingWhereInput {
  return {
    deletedAt: null,
    OR: [
      // Everyone sees live listings.
      { status: { in: ['ACTIVE', 'RESERVED', 'SOLD'] } },
      // Sellers additionally see their own drafts and pending items.
      ...(viewerId ? [{ sellerId: viewerId }] : []),
    ],
    seller: { status: 'ACTIVE', deletedAt: null },
  }
}

/** Fetch which of these listings the viewer has liked or saved, in one pass. */
export async function viewerInteractions(
  viewerId: string | undefined,
  listingIds: string[],
): Promise<{ likedIds: Set<string>; savedIds: Set<string> }> {
  if (!viewerId || listingIds.length === 0) {
    return { likedIds: new Set(), savedIds: new Set() }
  }

  const [likes, saves] = await Promise.all([
    db.listingLike.findMany({
      where: { userId: viewerId, listingId: { in: listingIds } },
      select: { listingId: true },
    }),
    db.savedListing.findMany({
      where: { userId: viewerId, listingId: { in: listingIds } },
      select: { listingId: true },
    }),
  ])

  return {
    likedIds: new Set(likes.map((l) => l.listingId)),
    savedIds: new Set(saves.map((s) => s.listingId)),
  }
}
