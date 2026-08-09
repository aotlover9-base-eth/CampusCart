import { db } from '../db'
import { env } from '../env'
import { hashToken, randomToken } from '../crypto'
import { signAccessToken, ttlToMs } from '../jwt'

/**
 * Refresh-token rotation.
 *
 * Access tokens are short-lived JWTs. Refresh tokens are opaque random strings
 * stored hashed in the database, so they're revocable. Every use of a refresh
 * token rotates it - the old one is marked `replacedById` and a new one is
 * issued. A stolen refresh token used after rotation is detectable as a replay
 * attack, and the entire session family is revoked.
 */

export interface SessionMeta {
  ipHash: string | null
  userAgent: string | null
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

/**
 * Create a new session for a user. Called after successful signup or login.
 * Returns an access JWT and an opaque refresh token.
 */
export async function createSession(
  userId: string,
  meta: SessionMeta,
): Promise<TokenPair> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, role: true, isVitVerified: true, status: true },
  })

  if (user.status !== 'ACTIVE') {
    throw new Error('Account is not active')
  }

  const refreshToken = randomToken()
  const refreshTokenHash = hashToken(refreshToken)
  const expiresAt = new Date(Date.now() + ttlToMs(env().JWT_REFRESH_TTL))

  await db.session.create({
    data: {
      userId,
      refreshTokenHash,
      expiresAt,
      ipHash: meta.ipHash,
      userAgent: meta.userAgent,
    },
  })

  const accessToken = await signAccessToken({
    sub: userId,
    role: user.role,
    vit: user.isVitVerified,
    status: user.status,
  })

  return { accessToken, refreshToken }
}

/**
 * Exchange a refresh token for a new access + refresh pair. This is the
 * rotation step: the old refresh token is consumed and a new one replaces it.
 */
export async function rotateSession(
  refreshToken: string,
  meta: SessionMeta,
): Promise<TokenPair> {
  const hash = hashToken(refreshToken)

  const session = await db.session.findUnique({
    where: { refreshTokenHash: hash },
    include: { user: { select: { id: true, role: true, isVitVerified: true, status: true } } },
  })

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    // The token was already used and rotated, or it's expired. Check if it was
    // replaced by another token - if so, that's a replay attack. Revoke the
    // entire chain to stop the attacker.
    if (session?.replacedById) {
      await revokeSessionFamily(session.id)
    }
    throw new Error('Refresh token is invalid or expired')
  }

  if (session.user.status !== 'ACTIVE') {
    throw new Error('Account is not active')
  }

  const newRefreshToken = randomToken()
  const newRefreshTokenHash = hashToken(newRefreshToken)
  const expiresAt = new Date(Date.now() + ttlToMs(env().JWT_REFRESH_TTL))

  // Create the replacement session.
  const newSession = await db.session.create({
    data: {
      userId: session.userId,
      refreshTokenHash: newRefreshTokenHash,
      expiresAt,
      ipHash: meta.ipHash,
      userAgent: meta.userAgent,
    },
  })

  // Mark the old token as replaced. This lets us detect replay attacks.
  await db.session.update({
    where: { id: session.id },
    data: { replacedById: newSession.id, revokedAt: new Date() },
  })

  const accessToken = await signAccessToken({
    sub: session.userId,
    role: session.user.role,
    vit: session.user.isVitVerified,
    status: session.user.status,
  })

  return { accessToken, refreshToken: newRefreshToken }
}

/**
 * Revoke a single session - used for logout. Returns true if a live session was
 * actually revoked.
 */
export async function revokeSession(refreshToken: string): Promise<boolean> {
  const hash = hashToken(refreshToken)
  const session = await db.session.findUnique({
    where: { refreshTokenHash: hash },
    select: { id: true, revokedAt: true },
  })

  if (!session || session.revokedAt) return false

  await db.session.update({
    where: { id: session.id },
    data: { revokedAt: new Date() },
  })

  return true
}

/** Revoke all sessions for a user - password change, account compromise. */
export async function revokeAllUserSessions(userId: string): Promise<number> {
  const { count } = await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  return count
}

/**
 * Replay-attack mitigation: if a replaced token is reused, revoke the entire
 * session family starting from that point forward. An attacker with a stolen
 * token can't keep using rotated descendants.
 */
async function revokeSessionFamily(startingSessionId: string): Promise<void> {
  // Walk forward through replacements and revoke everything.
  const toRevoke: string[] = []
  let current: string | null = startingSessionId

  while (current) {
    const session: { id: string; revokedAt: Date | null; replacedById: string | null } | null =
      await db.session.findUnique({
        where: { id: current },
        select: { id: true, revokedAt: true, replacedById: true },
      })

    if (!session) break
    if (!session.revokedAt) toRevoke.push(session.id)
    current = session.replacedById
  }

  if (toRevoke.length > 0) {
    await db.session.updateMany({
      where: { id: { in: toRevoke } },
      data: { revokedAt: new Date() },
    })
  }
}

/** Best-effort cleanup: sweep expired and long-revoked sessions. */
export async function pruneSessions(olderThanSeconds = 86_400): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanSeconds * 1_000)
  const { count } = await db.session.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { revokedAt: { lt: cutoff } },
      ],
    },
  })
  return count
}

/** Verify that a session exists and is live. Used by real-time transports. */
export async function isSessionLive(refreshToken: string): Promise<boolean> {
  const hash = hashToken(refreshToken)
  const session = await db.session.findUnique({
    where: { refreshTokenHash: hash },
    select: { revokedAt: true, expiresAt: true },
  })
  return Boolean(session && !session.revokedAt && session.expiresAt > new Date())
}
