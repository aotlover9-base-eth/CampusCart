import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { fail, handler, mutation, ok, parseBody } from '@/lib/api'
import { currentUser, requireUser } from '@/lib/auth/context'
import { updateListingSchema } from '@/lib/validation'
import { db } from '@/lib/db'
import { storage } from '@/lib/storage'
import { viewerFingerprint } from '@/lib/crypto'
import { listingCardSelect, serializeListingCard, viewerInteractions } from '@/lib/listings'

/**
 * GET    /api/listings/[listingId] — full detail, records a deduped view
 * PATCH  /api/listings/[listingId] — seller edits
 * DELETE /api/listings/[listingId] — soft delete by the seller
 */

interface Props {
  params: Promise<{ listingId: string }>
}

export async function GET(_request: Request, props: Props): Promise<NextResponse> {
  return handler(async () => {
    const { listingId } = await props.params
    const viewer = await currentUser()

    const listing = await db.listing.findFirst({
      where: { id: listingId, deletedAt: null },
      select: {
        ...listingCardSelect,
        description: true,
        contactPreference: true,
        availabilityNote: true,
        googleMapsUrl: true,
        chatCount: true,
        updatedAt: true,
        sellerId: true,
      },
    })

    if (!listing) return fail('Listing not found', 404)

    const isOwner = viewer?.id === listing.sellerId

    // Drafts and removed listings are visible only to their seller.
    if (!isOwner && !['ACTIVE', 'RESERVED', 'SOLD'].includes(listing.status)) {
      return fail('Listing not found', 404)
    }

    // Record a view, deduped per viewer per day. The seller's own visits and
    // failures here never affect the response.
    if (!isOwner) {
      await recordView(listingId, viewer?.id).catch(() => null)
    }

    const interactions = await viewerInteractions(viewer?.id, [listing.id])
    const card = serializeListingCard(listing, interactions)

    const store = storage()

    return ok({
      listing: {
        ...card,
        description: listing.description,
        contactPreference: listing.contactPreference,
        availabilityNote: listing.availabilityNote,
        chatCount: listing.chatCount,
        updatedAt: listing.updatedAt,
        // Precise coordinates are shared only once the listing is open — the
        // feed never carries them.
        latitude: listing.latitude,
        longitude: listing.longitude,
        googleMapsUrl: listing.googleMapsUrl,
        media: listing.media.map((m) => ({
          id: m.id,
          kind: m.kind,
          url: store.url(m.storageKey),
          thumbnailUrl: m.thumbnailKey ? store.url(m.thumbnailKey) : store.url(m.storageKey),
          blurDataUrl: m.blurDataUrl,
          width: m.width,
          height: m.height,
          altText: m.altText,
        })),
      },
      isOwner,
      // Phone numbers are never included here. Buyers must go through the
      // phone-request flow, which lands in Phase 3.
      canRequestPhone: Boolean(viewer) && !isOwner,
    })
  })
}

/** Deduped by (listing, viewer, day) via a unique constraint. */
async function recordView(listingId: string, viewerId: string | undefined): Promise<void> {
  const headerList = await headers()
  const ip = headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const userAgent = headerList.get('user-agent')

  const viewerKey = viewerId ?? viewerFingerprint(ip, userAgent)
  const dayBucket = new Date().toISOString().slice(0, 10)

  try {
    await db.listingView.create({
      data: { listingId, viewerId: viewerId ?? null, viewerKey, dayBucket },
    })
    // Only a genuinely new row bumps the counter.
    await db.listing.update({
      where: { id: listingId },
      data: { viewCount: { increment: 1 } },
    })
  } catch {
    // Unique violation — already counted today.
  }
}

export async function PATCH(request: Request, props: Props): Promise<NextResponse> {
  return mutation(async () => {
    const { listingId } = await props.params
    const user = await requireUser()
    const body = await parseBody(request, updateListingSchema)

    const existing = await db.listing.findFirst({
      where: { id: listingId, deletedAt: null },
      select: { id: true, sellerId: true, status: true, isFree: true },
    })

    if (!existing) return fail('Listing not found', 404)
    if (existing.sellerId !== user.id) {
      return fail('You can only edit your own listings', 403)
    }
    if (existing.status === 'REMOVED') {
      return fail('This listing was removed by moderation and cannot be edited', 403)
    }

    if (body.categoryId) {
      const category = await db.category.findUnique({
        where: { id: body.categoryId },
        select: { isActive: true, allowsCustomLabel: true },
      })
      if (!category?.isActive) {
        return fail('That category is unavailable', 400, { categoryId: 'Pick a valid category' })
      }
      if (body.customCategoryLabel && !category.allowsCustomLabel) {
        return fail('This category does not accept a custom label', 400)
      }
    }

    const isFree = body.isFree ?? existing.isFree
    const priceInPaise =
      body.priceRupees != null ? (isFree ? 0 : Math.round(body.priceRupees * 100)) : undefined

    const updated = await db.$transaction(async (tx) => {
      // Media is replace-all: the client sends the final ordered set.
      if (body.media) {
        await tx.listingMedia.deleteMany({ where: { listingId } })
        await tx.listingMedia.createMany({
          data: body.media.map((m, index) => ({
            listingId,
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
        })
      }

      return tx.listing.update({
        where: { id: listingId },
        data: {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(priceInPaise !== undefined ? { priceInPaise } : {}),
          ...(body.isFree !== undefined ? { isFree: body.isFree } : {}),
          ...(body.isNegotiable !== undefined ? { isNegotiable: isFree ? false : body.isNegotiable } : {}),
          ...(body.condition !== undefined ? { condition: body.condition } : {}),
          ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
          ...(body.customCategoryLabel !== undefined ? { customCategoryLabel: body.customCategoryLabel } : {}),
          ...(body.contactPreference !== undefined ? { contactPreference: body.contactPreference } : {}),
          ...(body.availabilityNote !== undefined ? { availabilityNote: body.availabilityNote } : {}),
          ...(body.locationLabel !== undefined ? { locationLabel: body.locationLabel } : {}),
          ...(body.hostelBlock !== undefined ? { hostelBlock: body.hostelBlock } : {}),
          ...(body.pickupArea !== undefined ? { pickupArea: body.pickupArea } : {}),
          ...(body.latitude !== undefined ? { latitude: body.latitude } : {}),
          ...(body.longitude !== undefined ? { longitude: body.longitude } : {}),
          ...(body.googleMapsUrl !== undefined ? { googleMapsUrl: body.googleMapsUrl } : {}),
        },
        select: listingCardSelect,
      })
    })

    return ok({ listing: serializeListingCard(updated) })
  })
}

export async function DELETE(_request: Request, props: Props): Promise<NextResponse> {
  return mutation(async () => {
    const { listingId } = await props.params
    const user = await requireUser()

    const existing = await db.listing.findFirst({
      where: { id: listingId, deletedAt: null },
      select: { id: true, sellerId: true, status: true },
    })

    if (!existing) return fail('Listing not found', 404)
    if (existing.sellerId !== user.id) {
      return fail('You can only delete your own listings', 403)
    }

    // Soft delete: conversations and reports referencing this listing stay
    // intact for the other party and for moderation.
    await db.$transaction(async (tx) => {
      await tx.listing.update({
        where: { id: listingId },
        data: { deletedAt: new Date(), status: 'REMOVED' },
      })

      if (existing.status === 'ACTIVE') {
        await tx.user.update({
          where: { id: user.id },
          data: { listingCount: { decrement: 1 } },
        })
      }
    })

    return ok({ deleted: true })
  })
}
