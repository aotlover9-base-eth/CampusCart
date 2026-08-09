import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/session-user'
import { db } from '@/lib/db'
import { ContactPanel } from '@/components/listing/contact-panel'

export const metadata: Metadata = {
  title: 'Contact seller',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ listingId: string }>
}

/**
 * Phone-request screen.
 *
 * Resolves the current state of the request server-side - none, pending,
 * accepted, or rejected - so the buyer lands on the right step. The number
 * itself is fetched separately by the client from the one route that gates it,
 * rather than being embedded here.
 */
export default async function ContactPage({ params }: Props) {
  const { listingId } = await params
  const user = await getSessionUser()
  if (!user) redirect(`/login?next=/listing/${listingId}/contact`)

  const listing = await db.listing.findFirst({
    where: { id: listingId, deletedAt: null },
    select: {
      id: true,
      title: true,
      priceInPaise: true,
      isFree: true,
      status: true,
      contactPreference: true,
      sellerId: true,
      seller: {
        select: {
          id: true,
          fullName: true,
          avatarUrl: true,
          isVitVerified: true,
          role: true,
        },
      },
    },
  })

  if (!listing) notFound()
  // Sellers have their own number; there is nothing to request.
  if (listing.sellerId === user.id) redirect(`/listing/${listingId}`)

  const request = await db.phoneRequest.findUnique({
    where: { listingId_buyerId: { listingId, buyerId: user.id } },
    select: {
      id: true,
      status: true,
      revokedAt: true,
      expiresAt: true,
      createdAt: true,
      respondedAt: true,
    },
  })

  const isLive =
    request?.status === 'ACCEPTED' &&
    !request.revokedAt &&
    (!request.expiresAt || request.expiresAt > new Date())

  return (
    <ContactPanel
      listing={{
        id: listing.id,
        title: listing.title,
        priceInPaise: listing.priceInPaise,
        isFree: listing.isFree,
        contactPreference: listing.contactPreference,
      }}
      seller={listing.seller}
      request={
        request
          ? {
              id: request.id,
              // A revoked grant reads as "no longer shared", not as accepted.
              status: request.revokedAt ? 'REVOKED' : request.status,
              createdAt: request.createdAt.toISOString(),
              respondedAt: request.respondedAt?.toISOString() ?? null,
            }
          : null
      }
      canSeeNumber={isLive}
    />
  )
}
