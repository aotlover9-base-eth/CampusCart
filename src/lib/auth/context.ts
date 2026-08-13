import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { db } from '../db'
import { env, isProduction } from '../env'
import { hashIp } from '../crypto'
import { ttlToMs, verifyAccessToken } from '../jwt'
import type { SessionMeta } from './session'

/**
 * Cookie-based auth context for route handlers and server components.
 *
 * Tokens live in httpOnly cookies rather than localStorage, which removes the
 * XSS token-theft path entirely and lets proxy.ts read auth state.
 */

export const ACCESS_COOKIE = 'cc_at'
export const REFRESH_COOKIE = 'cc_rt'
export const ADMIN_COOKIE = 'cc_admin'
/** Readable by client JS on purpose - it is the double-submit CSRF token. */
export const CSRF_COOKIE = 'cc_csrf'

export interface AuthUser {
  id: string
  fullName: string
  phone: string | null
  email: string | null
  role: string
  status: string
  isVitVerified: boolean
  avatarUrl: string | null
  department: string | null
  year: number | null
}

/**
 * The shape handed to client components. Same identity fields as AuthUser plus
 * the counters and badges the nav renders, minus anything the client has no use
 * for. Phone is included because it is the user's *own* number.
 */
export interface SessionUser {
  id: string
  fullName: string
  phone: string | null
  email: string | null
  emailVerifiedAt: string | null
  role: 'HOSTELLER' | 'DAY_SCHOLAR' | 'OTHER'
  department: string | null
  year: number | null
  bio: string | null
  avatarUrl: string | null
  isVitVerified: boolean
  listingCount: number
  soldCount: number
  subscriptionTier: 'FREE' | 'PLUS'
  createdAt: string
  unreadNotifications: number
  unreadChats: number
  /** Offers and phone requests awaiting this user's decision as a seller. */
  pendingRequests: number

  /**
   * Pickup location, flattened from whichever of the two location tables applies
   * to this user's role. Hostellers get a block; everyone else gets coordinates.
   * Coordinates power the distance sort and are the user's own, so returning
   * them to that same user reveals nothing.
   */
  hostelBlock: string | null
  latitude: number | null
  longitude: number | null
  locationLabel: string | null
}


/**
 * Resolve the signed-in user from the access-token cookie.
 * Returns null when there's no valid token - never throws.
 * Wrapped in React cache() so multiple components/services in a single server
 * request share 1 DB query instead of re-fetching the user every time.
 */
export const currentUser = cache(async (): Promise<AuthUser | null> => {
  const store = await cookies()
  const token = store.get(ACCESS_COOKIE)?.value
  if (!token) return null

  const claims = await verifyAccessToken(token)
  if (!claims) return null

  const user = await db.user.findUnique({
    where: { id: claims.sub },
    select: {
      id: true,
      fullName: true,
      phone: true,
      email: true,
      role: true,
      status: true,
      isVitVerified: true,
      avatarUrl: true,
      department: true,
      year: true,
      deletedAt: true,
    },
  })

  // A token can outlive a ban or deletion, so re-check status on every request.
  if (!user || user.deletedAt || user.status !== 'ACTIVE') return null

  const { deletedAt: _deletedAt, ...rest } = user
  return rest
})

/** Like currentUser, but throws a 401-shaped error for protected handlers. */
export async function requireUser(): Promise<AuthUser> {
  const user = await currentUser()
  if (!user) throw new UnauthorizedError()
  return user
}

export class UnauthorizedError extends Error {
  readonly status = 401
  constructor(message = 'You need to be signed in') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends Error {
  readonly status = 403
  constructor(message = 'You do not have access to this') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

/** Client IP and user agent, for session metadata and rate limiting. */
export async function requestMeta(): Promise<SessionMeta & { ip: string | null }> {
  const headerList = await headers()
  const forwarded = headerList.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() ?? headerList.get('x-real-ip') ?? null
  const userAgent = headerList.get('user-agent')?.slice(0, 300) ?? null

  return { ip, ipHash: hashIp(ip), userAgent }
}

/** Attach access + refresh cookies to a response. */
export function setAuthCookies(
  response: NextResponse,
  tokens: { accessToken: string; refreshToken: string },
): NextResponse {
  const { JWT_ACCESS_TTL, JWT_REFRESH_TTL } = env()

  response.cookies.set(ACCESS_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(ttlToMs(JWT_ACCESS_TTL) / 1_000),
  })

  response.cookies.set(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    // Scoped to the refresh endpoint so it is not sent with every request.
    path: '/api/auth',
    maxAge: Math.floor(ttlToMs(JWT_REFRESH_TTL) / 1_000),
  })

  return response
}

export function clearAuthCookies(response: NextResponse): NextResponse {
  response.cookies.set(ACCESS_COOKIE, '', { path: '/', maxAge: 0 })
  response.cookies.set(REFRESH_COOKIE, '', { path: '/api/auth', maxAge: 0 })
  return response
}

export async function readRefreshCookie(): Promise<string | null> {
  const store = await cookies()
  return store.get(REFRESH_COOKIE)?.value ?? null
}
