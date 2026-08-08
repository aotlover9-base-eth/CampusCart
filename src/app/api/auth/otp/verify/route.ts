import { NextResponse } from 'next/server'
import { fail, handler, mutation, ok, parseBody, tooManyRequests } from '@/lib/api'
import { verifyOtpSchema } from '@/lib/validation'
import { verifyOtp } from '@/lib/otp/service'
import { requestMeta, setAuthCookies } from '@/lib/auth/context'
import { createSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { env } from '@/lib/env'

/**
 * POST /api/auth/otp/verify
 *
 * Verifies a code and resolves the caller's next step:
 *
 *  • existing account  → signs in, returns `signedIn`
 *  • no account yet    → returns `needsProfile` with a short-lived claim so
 *                        /api/auth/complete-profile can finish signup
 */
export async function POST(request: Request): Promise<NextResponse> {
  return mutation(async () => {
    const body = await parseBody(request, verifyOtpSchema)
    const meta = await requestMeta()

    const destination = body.channel === 'SMS' ? body.phone! : body.email!

    const result = await verifyOtp({
      purpose: body.purpose,
      destination,
      code: body.code,
    })

    if (!result.ok) {
      return result.retryAfterSeconds
        ? tooManyRequests(result.error ?? 'Too many attempts', result.retryAfterSeconds)
        : fail(result.error ?? 'Verification failed', 400, { code: result.error ?? '' })
    }

    // EMAIL_VERIFY runs while already signed in — it attaches the address and
    // may grant the VIT badge. Handled by its own route.
    if (body.purpose === 'EMAIL_VERIFY') {
      return ok({ verified: true, next: 'email_attached' as const })
    }

    const user = await db.user.findFirst({
      where: body.channel === 'SMS' ? { phone: destination } : { email: destination },
      select: { id: true, status: true, deletedAt: true, fullName: true, role: true },
    })

    // No account: the caller has proven control of the number but still needs a
    // profile. Signup is completed by the next request.
    if (!user || user.deletedAt) {
      if (body.channel !== 'SMS') {
        return fail(
          'No account uses this email. Sign up with your phone number first.',
          404,
        )
      }
      return ok({
        verified: true,
        next: 'needs_profile' as const,
        phone: destination,
      })
    }

    if (user.status !== 'ACTIVE') {
      return fail('This account is not active. Contact support.', 403)
    }

    // Verifying by SMS also confirms the number, which matters for accounts
    // created before a phone-verification backfill.
    await db.user.update({
      where: { id: user.id },
      data: {
        ...(body.channel === 'SMS' ? { phoneVerifiedAt: new Date() } : {}),
        lastSeenAt: new Date(),
        isOnline: true,
      },
    })

    const tokens = await createSession(user.id, meta)

    const response = ok({
      verified: true,
      next: 'signed_in' as const,
      user: { id: user.id, fullName: user.fullName, role: user.role },
    })

    return setAuthCookies(response, tokens)
  })
}

/** Exposed so the client can show which domain grants the VIT badge. */
export async function GET(): Promise<NextResponse> {
  return handler(async () => ok({ vitEmailDomain: env().VIT_EMAIL_DOMAIN }))
}
