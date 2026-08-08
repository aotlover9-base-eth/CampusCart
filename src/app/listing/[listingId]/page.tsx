import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/lib/db'
import { currentUser } from '@/lib/auth/context'
import { storage, absoluteUrl } from '@/lib/storage'
import { listingCardSelect, serializeListingCard, viewerInteractions } from '@/lib/listings'
import { viewerFingerprint } from '@/lib/crypto'
import { formatPrice } from '@/lib/utils'
import { ListingDetail } from './listing-detail'

interface Props {
  params: Promise<{ listingId: string }>
}

/**
 * Public listing page.
 *
 * Server-rendered so a shared link previews correctly and loads fast. Ownership
 * and interaction state come from the same request, which the client component
 * then takes over for the interactive controls.
 */

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { listingId } = await params

  const listing = await db.listing.findFirst({
    where: { id: listingId, deletedAt: null, status: { in: ['ACTIVE', 'RESERVED', 'SOLD'] } },
    select: {
      title: true,
      description: true,
      priceInPaise: true,
      isFree: true,
      media: {
        orderBy: { sortOrder: 'asc' },
        take: 1,
        select: { storageKey: true, thumbnailKey: true, kind: true },
      },
    },
  })

  if (!listing) return { title: 'Listing not found' }

  const price = listing.isFree ? 'Free' : formatPrice(listing.priceInPaise)
  const cover = listing.media[0]
  // Videos have no OG-safe frame, so fall back to the site card for those.
  const image =
    cover && cover.kind === 'IMAGE'
      ? absoluteUrl(storage().url(cover.thumbnailKey ?? cover.storageKey))
      : absoluteUrl('/og.png')

  return {
    title: listing.title,
    description: `${price} · ${listing.description.slice(0, 150)}`,
    openGraph: {
      title: `${listing.title} — ${price}`,
      description: listing.description.slice(0, 200),
      images: [{ url: image }],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${listing.title} — ${price}`,
      images: [image],
    },
  }
}

export default async function ListingPage({ params }: Props) {
  const { listingId } = await params
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
      seller: {
        select: {
          id: true,
          fullName: true,
          avatarUrl: true,
          role: true,
          isVitVerified: true,
          isOnline: true,
          lastSeenAt: true,
          department: true,
          year: true,
          createdAt: true,
          listingCount: true,
          soldCount: true,
        },
      },
    },
  })

  if (!listing) notFound()

  const isOwner = viewer?.id === listing.sellerId

  // Drafts, hidden, and removed listings are visible only to their seller.
  if (!isOwner && !['ACTIVE', 'RESERVED', 'SOLD'].includes(listing.status)) {
    notFound()
  }

  if (!isOwner) {
    await recordView(listingId, viewer?.id).catch(() => null)
  }

  const interactions = await viewerInteractions(viewer?.id, [listing.id])
  const card = serializeListingCard(listing, interactions)
  const store = storage()

  return (
    <ListingDetail
      listing={{
        ...card,
        description: listing.description,
        contactPreference: listing.contactPreference,
        availabilityNote: listing.availabilityNote,
        chatCount: listing.chatCount,
        // Precise coordinates only reach an open listing page, never the feed.
        latitude: listing.latitude,
        longitude: listing.longitude,
        googleMapsUrl: listing.googleMapsUrl,
        media: listing.media.map((item) => ({
          id: item.id,
          kind: item.kind,
          url: store.url(item.storageKey),
          thumbnailUrl: item.thumbnailKey
            ? store.url(item.thumbnailKey)
            : store.url(item.storageKey),
          blurDataUrl: item.blurDataUrl,
          width: item.width,
          height: item.height,
          altText: item.altText,
        })),
      }}
      seller={{
        ...listing.seller,
        createdAt: listing.seller.createdAt.toISOString(),
        lastSeenAt: listing.seller.lastSeenAt.toISOString(),
      }}
      isOwner={isOwner}
      isSignedIn={Boolean(viewer)}
    />
  )
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
