import { NextResponse } from 'next/server'
import { fail, mutation, ok } from '@/lib/api'
import {
  clearAuthCookies,
  readRefreshCookie,
  requestMeta,
  setAuthCookies,
} from '@/lib/auth/context'
import { rotateSession } from '@/lib/auth/session'

/**
 * POST /api/auth/refresh
 *
 * Exchanges the refresh cookie for a new token pair. Rotation is enforced
 * server-side: reusing a rotated token revokes the whole session family.
 */
export async function POST(): Promise<NextResponse> {
  return mutation(async () => {
    const refreshToken = await readRefreshCookie()
    if (!refreshToken) {
      return clearAuthCookies(fail('Your session has expired. Sign in again.', 401))
    }

    const meta = await requestMeta()

    try {
      const tokens = await rotateSession(refreshToken, meta)
      return setAuthCookies(ok({ refreshed: true }), tokens)
    } catch {
      // Any rotation failure ends the session cleanly rather than leaving a
      // stale cookie the client would keep retrying with.
      return clearAuthCookies(fail('Your session has expired. Sign in again.', 401))
    }
  })
}
