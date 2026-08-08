import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import { env } from './env'

/**
 * JWT issuing and verification via jose (Web Crypto), so the same code runs in
 * Node and in the Edge proxy.
 *
 * Access tokens are short-lived and carry identity claims. Refresh tokens are
 * opaque random strings stored hashed in the database — not JWTs — so they can
 * be revoked server-side. See src/lib/auth/session.ts.
 */

const ISSUER = 'campuscart'
const AUDIENCE_USER = 'campuscart:user'
const AUDIENCE_ADMIN = 'campuscart:admin'

/**
 * Claim shapes. Declared as standalone interfaces (not extending JWTPayload)
 * so the index signature on JWTPayload doesn't erase these fields when they're
 * passed to the sign helpers.
 */
export interface AccessTokenClaims {
  sub: string
  role: string
  vit: boolean
  status: string
}

export interface AdminTokenClaims {
  sub: string
  username: string
  adminRole: string
  sid: string
}

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret)
}

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  const { JWT_ACCESS_SECRET, JWT_ACCESS_TTL } = env()

  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE_USER)
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(JWT_ACCESS_TTL)
    .sign(key(JWT_ACCESS_SECRET))
}

/** Returns null for any invalid, expired, or mis-scoped token. */
export async function verifyAccessToken(
  token: string,
): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(env().JWT_ACCESS_SECRET), {
      issuer: ISSUER,
      audience: AUDIENCE_USER,
      algorithms: ['HS256'],
    })
    if (typeof payload.sub !== 'string') return null
    return payload as JWTPayload & AccessTokenClaims
  } catch {
    return null
  }
}

export async function signAdminToken(claims: AdminTokenClaims): Promise<string> {
  const { ADMIN_JWT_SECRET, ADMIN_SESSION_TTL } = env()

  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE_ADMIN)
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(ADMIN_SESSION_TTL)
    .sign(key(ADMIN_JWT_SECRET))
}

/**
 * Admin tokens are verified with a different secret and audience, so a user
 * token can never satisfy an admin check even if the secrets were swapped.
 */
export async function verifyAdminToken(
  token: string,
): Promise<AdminTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(env().ADMIN_JWT_SECRET), {
      issuer: ISSUER,
      audience: AUDIENCE_ADMIN,
      algorithms: ['HS256'],
    })
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null
    return payload as JWTPayload & AdminTokenClaims
  } catch {
    return null
  }
}

/** Parse a TTL string like "15m" / "30d" / "8h" into milliseconds. */
export function ttlToMs(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl.trim())
  if (!match) throw new Error(`Invalid TTL: ${ttl}`)

  const value = Number(match[1])
  const unit = match[2] as 's' | 'm' | 'h' | 'd'
  const factor = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]
  return value * factor
}
