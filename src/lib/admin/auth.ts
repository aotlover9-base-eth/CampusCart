import { cookies, headers } from 'next/headers'
import { cache } from 'react'
import { NextResponse } from 'next/server'
import { ADMIN_COOKIE } from '../auth/context'
import { hashIp, hashToken, randomToken } from '../crypto'
import { signAdminToken, ttlToMs, verifyAdminToken } from '../jwt'
import { env, isProduction } from '../env'
import { db } from '../db'
import type { AdminRole } from '@/generated/prisma/enums'

/**
 * Admin authentication.
 *
 * Entirely separate from user auth: a different cookie, a different signing
 * secret, a different JWT audience, and a different table. A user token can
 * never satisfy an admin check, and a leaked user secret grants no admin access.
 *
 * The JWT is short-lived and carries a session id (`sid`). Every request
 * re-checks that the session row is live, so revoking a session takes effect
 * immediately rather than when the token happens to expire.
 */

export interface AdminIdentity {
  id: string
  username: string
  role: AdminRole
  sessionId: string
}

export class AdminUnauthorizedError extends Error {
  readonly status = 401
  constructor(message = 'Admin sign-in required') {
    super(message)
    this.name = 'AdminUnauthorizedError'
  }
}

export class AdminForbiddenError extends Error {
  readonly status = 403
  constructor(message = 'Your admin role does not allow this') {
    super(message)
    this.name = 'AdminForbiddenError'
  }
}

/**
 * Resolve the signed-in admin, or null.
 *
 * `cache` keeps the layout, the page, and any nested server component to one
 * lookup per request.
 */
export const currentAdmin = cache(async (): Promise<AdminIdentity | null> => {
  const store = await cookies()
  const token = store.get(ADMIN_COOKIE)?.value
  if (!token) return null

  const claims = await verifyAdminToken(token)
  if (!claims) return null

  // A valid signature is not enough: the session must still be live and the
  // account still active.
  const session = await db.adminSession.findFirst({
    where: {
      id: claims.sid,
      adminId: claims.sub,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      admin: { select: { id: true, username: true, role: true, isActive: true } },
    },
  })

  if (!session || !session.admin.isActive) return null

  return {
    id: session.admin.id,
    username: session.admin.username,
    role: session.admin.role,
    sessionId: session.id,
  }
})

export async function requireAdmin(): Promise<AdminIdentity> {
  const admin = await currentAdmin()
  if (!admin) throw new AdminUnauthorizedError()
  return admin
}

/** Role gate for privileged actions. SUPER_ADMIN passes everything. */
export async function requireAdminRole(
  ...allowed: AdminRole[]
): Promise<AdminIdentity> {
  const admin = await requireAdmin()
  if (admin.role !== 'SUPER_ADMIN' && !allowed.includes(admin.role)) {
    throw new AdminForbiddenError()
  }
  return admin
}

/**
 * Start an admin session.
 *
 * The opaque token is stored hashed, so a database leak yields nothing usable.
 */
export async function createAdminSession(
  adminId: string,
  meta: { ipHash: string | null; userAgent: string | null },
): Promise<{ token: string; expiresAt: Date }> {
  const { ADMIN_SESSION_TTL } = env()
  const expiresAt = new Date(Date.now() + ttlToMs(ADMIN_SESSION_TTL))

  const raw = randomToken(32)

  const session = await db.adminSession.create({
    data: {
      adminId,
      tokenHash: hashToken(raw),
      expiresAt,
      ipHash: meta.ipHash,
      userAgent: meta.userAgent,
    },
    select: { id: true, admin: { select: { username: true, role: true } } },
  })

  const token = await signAdminToken({
    sub: adminId,
    username: session.admin.username,
    adminRole: session.admin.role,
    sid: session.id,
  })

  return { token, expiresAt }
}

export function setAdminCookie(
  response: NextResponse,
  token: string,
  expiresAt: Date,
): NextResponse {
  response.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    // Stricter than the user cookie: the admin panel is never linked from
    // anywhere, so it never needs to survive a cross-site navigation.
    sameSite: 'strict',
    path: '/',
    maxAge: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1_000)),
  })
  return response
}

export function clearAdminCookie(response: NextResponse): NextResponse {
  response.cookies.set(ADMIN_COOKIE, '', { path: '/', maxAge: 0 })
  return response
}

export async function revokeAdminSession(sessionId: string): Promise<void> {
  await db.adminSession
    .update({ where: { id: sessionId }, data: { revokedAt: new Date() } })
    .catch(() => null)
}

/**
 * Append to the audit trail.
 *
 * Every privileged action calls this. Never throws — a logging failure must not
 * roll back the action it was recording, and the alternative (silently skipping
 * the action) is worse.
 */
export async function auditLog(input: {
  adminId: string
  action: string
  entityType?: string
  entityId?: string
  summary?: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    const headerList = await headers()
    const ip = headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null

    await db.auditLog.create({
      data: {
        adminId: input.adminId,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        summary: input.summary ?? null,
        metadata: (input.metadata ?? undefined) as never,
        ipHash: hashIp(ip),
        userAgent: headerList.get('user-agent')?.slice(0, 300) ?? null,
      },
    })
  } catch (error) {
    console.error('[audit] failed to record action:', input.action, error)
  }
}

/** The env-configured base path. Never hardcode this anywhere else. */
export function adminBasePath(): string {
  return `/${env().ADMIN_PANEL_PATH.replace(/^\/+|\/+$/g, '')}`
}
