import { cache } from 'react'
import { currentUser, type SessionUser } from './context'
import { db } from '../db'

/**
 * Load the full client-facing session user.
 *
 * Wrapped in React's `cache` so the app layout, a page, and any server component
 * beneath them share one query per request instead of three.
 *
 * `/api/auth/me` returns the same shape, which is what lets the client provider
 * re-seed itself from a plain refresh call.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const auth = await currentUser()
  if (!auth) return null

  const profile = await db.user.findUnique({
    where: { id: auth.id },
    select: {
      id: true,
      fullName: true,
      phone: true,
      email: true,
      emailVerifiedAt: true,
      role: true,
      department: true,
      year: true,
      bio: true,
      avatarUrl: true,
      isVitVerified: true,
      listingCount: true,
      soldCount: true,
      subscriptionTier: true,
      createdAt: true,
      hostelLocation: {
        select: { block: true, roomNumber: true },
      },
      geoLocation: {
        select: { latitude: true, longitude: true, area: true, address: true },
      },
    },
  })

  if (!profile) return null

  const { hostelLocation, geoLocation, ...rest } = profile

  return {
    ...rest,
    // Dates cross the server/client boundary as ISO strings.
    emailVerifiedAt: profile.emailVerifiedAt?.toISOString() ?? null,
    createdAt: profile.createdAt.toISOString(),
    // Flatten whichever location table applies to this user's role.
    hostelBlock: hostelLocation?.block ?? null,
    latitude: geoLocation?.latitude ?? null,
    longitude: geoLocation?.longitude ?? null,
    locationLabel:
      hostelLocation?.block
        ? [hostelLocation.block, hostelLocation.roomNumber].filter(Boolean).join(' · ')
        : (geoLocation?.area ?? geoLocation?.address ?? null),
    unreadNotifications: 0,
    unreadChats: 0,
    pendingRequests: 0,
  }
})
