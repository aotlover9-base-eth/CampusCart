import { NextResponse } from 'next/server'
import { z } from 'zod'
import { fail, mutation, ok, parseBody, tooManyRequests } from '@/lib/api'
import { requestMeta } from '@/lib/auth/context'
import { adminLoginLimiter } from '@/lib/rate-limit'
import { verifyPassword } from '@/lib/crypto'
import { db } from '@/lib/db'
import {
  auditLog,
  createAdminSession,
  setAdminCookie,
} from '@/lib/admin/auth'

/**
 * POST /api/admin/login
 *
 * Deliberately slow and uninformative. Every failure returns the same message
 * with the same shape, so this cannot be used to enumerate admin usernames, and
 * repeated failures lock the account for a spell.
 */

const LOCKOUT_THRESHOLD = 5
const LOCKOUT_MINUTES = 15

const schema = z.object({
  username: z.string().trim().min(1).max(60).toLowerCase(),
  password: z.string().min(1).max(200),
})

export async function POST(request: Request): Promise<NextResponse> {
  return mutation(async () => {
    const { ip, ipHash, userAgent } = await requestMeta()

    // Per-IP throttle first, so a spray across many usernames is capped too.
    const limit = await adminLoginLimiter(ipHash ?? 'unknown')
    if (!limit.allowed) {
      return tooManyRequests('Too many attempts. Try again later.', limit.retryAfterSeconds)
    }

    const body = await parseBody(request, schema)

    const admin = await db.adminUser.findUnique({
      where: { username: body.username },
      select: {
        id: true,
        username: true,
        passwordHash: true,
        isActive: true,
        failedAttempts: true,
        lockedUntil: true,
      },
    })

    // Uniform rejection for every failure mode below.
    const reject = () => fail('Invalid credentials', 401)

    if (!admin || !admin.isActive) {
      // Still burn time on a missing account so response timing does not
      // distinguish "no such user" from "wrong password".
      await verifyPassword(body.password, 'scrypt$65536$8$1$00$00')
      return reject()
    }

    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      return fail('This account is temporarily locked. Try again later.', 423)
    }

    const valid = await verifyPassword(body.password, admin.passwordHash)

    if (!valid) {
      const failedAttempts = admin.failedAttempts + 1
      const shouldLock = failedAttempts >= LOCKOUT_THRESHOLD

      await db.adminUser.update({
        where: { id: admin.id },
        data: {
          failedAttempts,
          ...(shouldLock
            ? {
                lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60_000),
                failedAttempts: 0,
              }
            : {}),
        },
      })

      void auditLog({
        adminId: admin.id,
        action: 'admin.login.failed',
        summary: shouldLock ? 'Failed sign-in — account locked' : 'Failed sign-in',
      })

      return reject()
    }

    await db.adminUser.update({
      where: { id: admin.id },
      data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    })

    const { token, expiresAt } = await createAdminSession(admin.id, { ipHash, userAgent })

    void auditLog({
      adminId: admin.id,
      action: 'admin.login',
      summary: `Signed in from ${ip ? 'a known address' : 'an unknown address'}`,
    })

    return setAdminCookie(ok({ signedIn: true }), token, expiresAt)
  })
}
