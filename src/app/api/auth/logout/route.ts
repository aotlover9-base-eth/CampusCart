import { NextResponse } from 'next/server'
import { mutation, ok } from '@/lib/api'
import { clearAuthCookies, currentUser, readRefreshCookie } from '@/lib/auth/context'
import { revokeSession } from '@/lib/auth/session'
import { db } from '@/lib/db'

/**
 * POST /api/auth/logout
 *
 * Revokes the refresh token server-side and clears both cookies. Always
 * succeeds - logging out must never fail from the user's point of view.
 */
export async function POST(): Promise<NextResponse> {
  return mutation(async () => {
    const [refreshToken, user] = await Promise.all([readRefreshCookie(), currentUser()])

    if (refreshToken) {
      await revokeSession(refreshToken).catch(() => false)
    }

    if (user) {
      await db.user
        .update({
          where: { id: user.id },
          data: { isOnline: false, lastSeenAt: new Date() },
        })
        .catch(() => null)
    }

    return clearAuthCookies(ok({ signedOut: true }))
  })
}
