import type { OtpChannel, OtpPurpose } from '@/generated/prisma/enums'
import { db } from '../db'
import { env } from '../env'
import { generateOtp, hashToken, safeEqualHex } from '../crypto'
import { otpSendLimiter, otpIpLimiter, otpVerifyLimiter } from '../rate-limit'
import { emailProvider, smsProvider } from './providers'

/**
 * OTP issue and verification.
 *
 * Codes are stored as SHA-256 digests, never plaintext. A destination may have
 * only one live code per purpose at a time — requesting a new one invalidates
 * the previous. Verification is constant-time and attempt-capped both per row
 * and per destination.
 */

export interface IssueOtpInput {
  channel: OtpChannel
  purpose: OtpPurpose
  destination: string
  ip: string | null
}

export interface IssueOtpResult {
  ok: boolean
  error?: string
  retryAfterSeconds?: number
  expiresInSeconds?: number
  /** Non-production only, when the console provider is active. */
  devCode?: string
}

export async function issueOtp(input: IssueOtpInput): Promise<IssueOtpResult> {
  const { channel, purpose, destination, ip } = input
  const { OTP_TTL_SECONDS, OTP_RESEND_COOLDOWN_SECONDS } = env()

  // Per-destination and per-IP limits both apply.
  const perDestination = await otpSendLimiter(destination)
  if (!perDestination.allowed) {
    return {
      ok: false,
      error: 'Too many codes requested for this number. Try again later.',
      retryAfterSeconds: perDestination.retryAfterSeconds,
    }
  }

  const perIp = await otpIpLimiter(ip)
  if (!perIp.allowed) {
    return {
      ok: false,
      error: 'Too many requests from this device. Try again later.',
      retryAfterSeconds: perIp.retryAfterSeconds,
    }
  }

  // Enforce a resend cooldown so the UI can't spam the provider.
  const recent = await db.otpCode.findFirst({
    where: { destination, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })

  if (recent) {
    const elapsed = (Date.now() - recent.createdAt.getTime()) / 1_000
    if (elapsed < OTP_RESEND_COOLDOWN_SECONDS) {
      return {
        ok: false,
        error: 'A code was just sent. Please wait before requesting another.',
        retryAfterSeconds: Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed),
      }
    }
  }

  const code = generateOtp(6)
  const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1_000)

  // Invalidate any outstanding codes for this destination + purpose, then store
  // the new one. Doing both in a transaction avoids a window where two codes
  // are simultaneously valid.
  await db.$transaction([
    db.otpCode.updateMany({
      where: { destination, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    db.otpCode.create({
      data: {
        channel,
        purpose,
        destination,
        codeHash: hashToken(code),
        expiresAt,
        requestIpHash: null,
      },
    }),
  ])

  const provider = channel === 'SMS' ? smsProvider() : emailProvider()
  const sent = await provider.send({
    destination,
    code,
    expiresInSeconds: OTP_TTL_SECONDS,
  })

  if (!sent.ok) {
    // Delivery failed — burn the code so a retry issues a fresh one.
    await db.otpCode.updateMany({
      where: { destination, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    })
    return { ok: false, error: sent.error ?? 'Could not send the verification code' }
  }

  return {
    ok: true,
    expiresInSeconds: OTP_TTL_SECONDS,
    devCode: sent.devCode,
  }
}

export interface VerifyOtpResult {
  ok: boolean
  error?: string
  retryAfterSeconds?: number
  attemptsRemaining?: number
}

export async function verifyOtp(input: {
  purpose: OtpPurpose
  destination: string
  code: string
}): Promise<VerifyOtpResult> {
  const { purpose, destination, code } = input
  const { OTP_MAX_ATTEMPTS } = env()

  const limit = await otpVerifyLimiter(destination)
  if (!limit.allowed) {
    return {
      ok: false,
      error: 'Too many attempts. Request a new code shortly.',
      retryAfterSeconds: limit.retryAfterSeconds,
    }
  }

  const record = await db.otpCode.findFirst({
    where: { destination, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  })

  if (!record) {
    return { ok: false, error: 'No active code. Request a new one.' }
  }

  if (record.expiresAt < new Date()) {
    await db.otpCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    })
    return { ok: false, error: 'That code has expired. Request a new one.' }
  }

  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    await db.otpCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    })
    return { ok: false, error: 'Too many incorrect attempts. Request a new code.' }
  }

  if (!safeEqualHex(hashToken(code), record.codeHash)) {
    const updated = await db.otpCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    })
    return {
      ok: false,
      error: 'That code is incorrect.',
      attemptsRemaining: Math.max(0, OTP_MAX_ATTEMPTS - updated.attempts),
    }
  }

  // Success — consume the code so it can't be replayed.
  await db.otpCode.update({
    where: { id: record.id },
    data: { consumedAt: new Date() },
  })

  return { ok: true }
}

/** Sweep expired and consumed codes. Safe to call from a cron route. */
export async function pruneOtpCodes(olderThanSeconds = 86_400): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanSeconds * 1_000)
  const { count } = await db.otpCode.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: new Date() } }, { consumedAt: { lt: cutoff } }],
    },
  })
  return count
}
