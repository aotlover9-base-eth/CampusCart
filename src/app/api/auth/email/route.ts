import { NextResponse } from 'next/server'
import { z } from 'zod'
import { fail, mutation, ok, parseBody, tooManyRequests } from '@/lib/api'
import { emailSchema, otpCodeSchema } from '@/lib/validation'
import { issueOtp, verifyOtp } from '@/lib/otp/service'
import { requireUser, requestMeta } from '@/lib/auth/context'
import { db } from '@/lib/db'
import { env } from '@/lib/env'

/**
 * Email verification — the only path to the VIT Verified badge.
 *
 * POST   sends a code to the address
 * PUT    confirms the code, attaches the email, and grants the badge when the
 *        domain matches VIT_EMAIL_DOMAIN
 */

const sendSchema = z.object({ email: emailSchema })
const confirmSchema = z.object({ email: emailSchema, code: otpCodeSchema })

export async function POST(request: Request): Promise<NextResponse> {
  return mutation(async () => {
    const user = await requireUser()
    const { email } = await parseBody(request, sendSchema)
    const { ip } = await requestMeta()

    const taken = await db.user.findFirst({
      where: { email, deletedAt: null, NOT: { id: user.id } },
      select: { id: true },
    })
    if (taken) {
      return fail('That email is already linked to another account.', 409, {
        email: 'Already in use',
      })
    }

    const result = await issueOtp({
      channel: 'EMAIL',
      purpose: 'EMAIL_VERIFY',
      destination: email,
      ip,
    })

    if (!result.ok) {
      return result.retryAfterSeconds
        ? tooManyRequests(result.error ?? 'Please wait', result.retryAfterSeconds)
        : fail(result.error ?? 'Could not send the code')
    }

    const vitDomain = env().VIT_EMAIL_DOMAIN.toLowerCase()

    return ok({
      sent: true,
      expiresInSeconds: result.expiresInSeconds,
      grantsBadge: email.endsWith(`@${vitDomain}`),
      devCode: result.devCode,
    })
  })
}

export async function PUT(request: Request): Promise<NextResponse> {
  return mutation(async () => {
    const user = await requireUser()
    const { email, code } = await parseBody(request, confirmSchema)

    const result = await verifyOtp({
      purpose: 'EMAIL_VERIFY',
      destination: email,
      code,
    })

    if (!result.ok) {
      return result.retryAfterSeconds
        ? tooManyRequests(result.error ?? 'Too many attempts', result.retryAfterSeconds)
        : fail(result.error ?? 'Verification failed', 400, { code: result.error ?? '' })
    }

    // Re-check uniqueness at commit time — another account may have claimed the
    // address between the send and the confirm.
    const taken = await db.user.findFirst({
      where: { email, deletedAt: null, NOT: { id: user.id } },
      select: { id: true },
    })
    if (taken) {
      return fail('That email was just linked to another account.', 409)
    }

    const vitDomain = env().VIT_EMAIL_DOMAIN.toLowerCase()
    const isVit = email.endsWith(`@${vitDomain}`)

    const updated = await db.user.update({
      where: { id: user.id },
      data: {
        email,
        emailVerifiedAt: new Date(),
        // The badge is granted only for a verified address on the VIT domain,
        // and is never revoked here — an admin can remove it if needed.
        ...(isVit ? { isVitVerified: true } : {}),
      },
      select: { email: true, emailVerifiedAt: true, isVitVerified: true },
    })

    if (isVit) {
      await db.notification.create({
        data: {
          userId: user.id,
          kind: 'ACCOUNT_VERIFIED',
          title: 'You are VIT Verified',
          body: 'Your VIT Bhopal email is confirmed. Your listings now show the verified badge.',
          href: '/profile',
        },
      })
    }

    return ok({ verified: true, ...updated })
  })
}
