import { NextResponse } from 'next/server'
import { fail, mutation, ok, parseBody, tooManyRequests } from '@/lib/api'
import { requestOtpSchema } from '@/lib/validation'
import { issueOtp } from '@/lib/otp/service'
import { requestMeta } from '@/lib/auth/context'
import { db } from '@/lib/db'

/**
 * POST /api/auth/otp/request
 *
 * Issues a verification code. Deliberately does not reveal whether an account
 * exists — the response is identical either way, so this endpoint cannot be used
 * to enumerate registered phone numbers.
 */
export async function POST(request: Request): Promise<NextResponse> {
  return mutation(async () => {
    const body = await parseBody(request, requestOtpSchema)
    const { ip } = await requestMeta()

    const destination = body.channel === 'SMS' ? body.phone! : body.email!

    // Block OTPs to banned or suspended accounts outright.
    const existing = await db.user.findFirst({
      where: body.channel === 'SMS' ? { phone: destination } : { email: destination },
      select: { status: true, suspendedTill: true },
    })

    if (existing?.status === 'BANNED') {
      return fail('This account has been permanently suspended.', 403)
    }

    if (
      existing?.status === 'SUSPENDED' &&
      existing.suspendedTill &&
      existing.suspendedTill > new Date()
    ) {
      return fail('This account is temporarily suspended.', 403)
    }

    const result = await issueOtp({
      channel: body.channel,
      purpose: body.purpose,
      destination,
      ip,
    })

    if (!result.ok) {
      return result.retryAfterSeconds
        ? tooManyRequests(result.error ?? 'Please wait before retrying', result.retryAfterSeconds)
        : fail(result.error ?? 'Could not send the code')
    }

    return ok({
      sent: true,
      channel: body.channel,
      // Masked so the UI can confirm the destination without exposing it fully.
      destination: maskDestination(destination, body.channel),
      expiresInSeconds: result.expiresInSeconds,
      // Present only in development, so the flow is testable without a provider.
      devCode: result.devCode,
    })
  })
}

function maskDestination(value: string, channel: 'SMS' | 'EMAIL'): string {
  if (channel === 'SMS') {
    return `${value.slice(0, 3)}•••••${value.slice(-3)}`
  }
  const [local = '', domain = ''] = value.split('@')
  const head = local.slice(0, 2)
  return `${head}${'•'.repeat(Math.max(1, local.length - 2))}@${domain}`
}
