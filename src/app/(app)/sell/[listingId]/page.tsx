import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/session-user'
import { listCategories } from '@/lib/categories'
import { db } from '@/lib/db'
import { storage } from '@/lib/storage'
import { ListingComposer } from '@/components/sell/listing-composer'

export const metadata: Metadata = {
  title: 'Edit listing',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ listingId: string }>
}

/**
 * Edit an existing listing.
 *
 * Reuses the compose form. Ownership is enforced here as well as in the PATCH
 * handler — this stops someone reaching the form at all, rather than only
 * failing when they submit.
 */
export default async function EditListingPage({ params }: Props) {
  const { listingId } = await params
  const user = await getSessionUser()

  if (!user) redirect('/login')

  const [listing, categories] = await Promise.all([
    db.listing.findFirst({
      where: { id: listingId, deletedAt: null },
      select: {
        id: true,
        sellerId: true,
        title: true,
        description: true,
        priceInPaise: true,
        isFree: true,
        isNegotiable: true,
        condition: true,
        categoryId: true,
        customCategoryLabel: true,
        contactPreference: true,
        availabilityNote: true,
        locationLabel: true,
        hostelBlock: true,
        pickupArea: true,
        media: {
          orderBy: { sortOrder: 'asc' },
          select: {
            kind: true,
            storageKey: true,
            thumbnailKey: true,
            blurDataUrl: true,
            mimeType: true,
            width: true,
            height: true,
            sizeBytes: true,
          },
        },
      },
    }),
    listCategories(),
  ])

  if (!listing) notFound()
  // Not the owner: 404 rather than 403, so this cannot confirm a listing exists.
  if (listing.sellerId !== user.id) notFound()

  const store = storage()

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 sm:py-7">
      <header className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--color-ink)] sm:text-[26px]">
          Edit listing
        </h1>
        <p className="mt-1 text-[13px] text-[var(--color-ink-muted)]">
          Changes go live immediately.
        </p>
      </header>

      <ListingComposer
        categories={categories}
        defaultLocation={{
          role: user.role,
          hostelBlock: user.hostelBlock,
          latitude: user.latitude,
          longitude: user.longitude,
          locationLabel: user.locationLabel,
        }}
        existing={{
          id: listing.id,
          title: listing.title,
          description: listing.description,
          priceInPaise: listing.priceInPaise,
          isFree: listing.isFree,
          isNegotiable: listing.isNegotiable,
          condition: listing.condition,
          categoryId: listing.categoryId,
          customCategoryLabel: listing.customCategoryLabel,
          contactPreference: listing.contactPreference,
          availabilityNote: listing.availabilityNote,
          locationLabel: listing.locationLabel,
          hostelBlock: listing.hostelBlock,
          pickupArea: listing.pickupArea,
          media: listing.media.map((item) => ({
            kind: item.kind,
            storageKey: item.storageKey,
            url: store.url(item.storageKey),
            ...(item.thumbnailKey
              ? { thumbnailKey: item.thumbnailKey, thumbnailUrl: store.url(item.thumbnailKey) }
              : {}),
            ...(item.blurDataUrl ? { blurDataUrl: item.blurDataUrl } : {}),
            mimeType: item.mimeType,
            ...(item.width ? { width: item.width } : {}),
            ...(item.height ? { height: item.height } : {}),
            sizeBytes: item.sizeBytes,
          })),
        }}
      />
    </div>
  )
}
