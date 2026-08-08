import { NextResponse } from 'next/server'
import { handler, ok } from '@/lib/api'
import { getSessionUser } from '@/lib/auth/session-user'

/**
 * GET /api/auth/me
 *
 * Returns the signed-in user. Responds with `user: null` rather than 401 when
 * signed out, so the client can treat "not signed in" as a normal state instead
 * of an error. Shares its query shape with the server-side `getSessionUser`,
 * which is what lets the client session provider re-seed from this route.
 */
export async function GET(): Promise<NextResponse> {
  return handler(async () => ok({ user: await getSessionUser() }))
}
