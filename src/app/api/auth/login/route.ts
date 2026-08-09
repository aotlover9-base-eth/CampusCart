import { NextResponse } from 'next/server'
import { fail, mutation, ok, parseBody } from '@/lib/api'
import { loginWithPasswordSchema } from '@/lib/validation'
import { verifyPassword } from '@/lib/crypto'
import { requestMeta, setAuthCookies } from '@/lib/auth/context'
import { createSession } from '@/lib/auth/session'
import { db } from '@/lib/db'

/**
 * POST /api/auth/login
 *
 * Direct email + password authentication.
 */
export async function POST(request: Request): Promise<NextResponse> {
  return mutation(async () => {
    const body = await parseBody(request, loginWithPasswordSchema)
    const meta = await requestMeta()

    const user = await db.user.findFirst({
      where: { email: body.email, deletedAt: null },
      select: {
        id: true,
        fullName: true,
        role: true,
        status: true,
        passwordHash: true,
        suspendedTill: true,
      },
    })

    if (!user) {
      return fail('No account found with this email.', 404)
    }

    if (user.status === 'BANNED') {
      return fail('This account has been permanently suspended.', 403)
    }

    if (
      user.status === 'SUSPENDED' &&
      user.suspendedTill &&
      user.suspendedTill > new Date()
    ) {
      return fail('This account is temporarily suspended.', 403)
    }

    if (user.status !== 'ACTIVE') {
      return fail('This account is not active. Contact support.', 403)
    }

    if (!user.passwordHash) {
      return fail('No password set for this account. Sign in using Email OTP.', 400)
    }

    const isValid = await verifyPassword(body.password, user.passwordHash)
    if (!isValid) {
      return fail('Incorrect password. Please try again.', 401)
    }

    // Update last seen
    await db.user.update({
      where: { id: user.id },
      data: { lastSeenAt: new Date(), isOnline: true },
    })

    const tokens = await createSession(user.id, meta)

    const response = ok({
      signedIn: true,
      user: { id: user.id, fullName: user.fullName, role: user.role },
    })

    return setAuthCookies(response, tokens)
  })
}
