import { NextResponse } from 'next/server'
import { z } from 'zod'
import { fail, mutation, ok, parseBody } from '@/lib/api'
import {
  completeProfileSchema,
  geoLocationSchema,
  hostelLocationSchema,
  phoneSchema,
} from '@/lib/validation'
import { requestMeta, setAuthCookies } from '@/lib/auth/context'
import { createSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { env } from '@/lib/env'

/**
 * POST /api/auth/complete-profile
 *
 * Finishes signup after the phone OTP has been verified. Re-checks that a live
 * consumed PHONE_VERIFY/SIGNUP code exists for the number, so a caller cannot
 * create an account for a number they never proved control of.
 */

const bodySchema = completeProfileSchema.extend({
  phone: phoneSchema,
  hostelLocation: hostelLocationSchema.optional(),
  geoLocation: geoLocationSchema.optional(),
  referralCode: z.string().trim().max(16).optional(),
})

/** A verification is only usable for a short window after the code is consumed. */
const VERIFICATION_GRACE_MS = 15 * 60 * 1_000

export async function POST(request: Request): Promise<NextResponse> {
  return mutation(async () => {
    const body = await parseBody(request, bodySchema)
    const meta = await requestMeta()

    // Proof of phone ownership: a recently consumed SIGNUP code for this number.
    const proof = await db.otpCode.findFirst({
      where: {
        destination: body.phone,
        channel: 'SMS',
        purpose: { in: ['SIGNUP', 'LOGIN', 'PHONE_VERIFY'] },
        consumedAt: { gte: new Date(Date.now() - VERIFICATION_GRACE_MS) },
      },
      orderBy: { consumedAt: 'desc' },
      select: { id: true },
    })

    if (!proof) {
      return fail('Verify your phone number again before continuing.', 400)
    }

    const existing = await db.user.findUnique({
      where: { phone: body.phone },
      select: { id: true, deletedAt: true },
    })

    if (existing && !existing.deletedAt) {
      return fail('An account already exists for this number. Sign in instead.', 409)
    }

    // Role and location must agree: hostellers give block/room, everyone else
    // gives a map location.
    if (body.role === 'HOSTELLER' && !body.hostelLocation) {
      return fail('Add your hostel block and room details.', 400, {
        'hostelLocation.block': 'Required for hostellers',
      })
    }

    if (body.email) {
      const emailTaken = await db.user.findFirst({
        where: { email: body.email, deletedAt: null },
        select: { id: true },
      })
      if (emailTaken) {
        return fail('That email is already linked to another account.', 409, {
          email: 'Already in use',
        })
      }
    }

    const vitDomain = env().VIT_EMAIL_DOMAIN.toLowerCase()
    // The badge requires a *verified* address, so signup never grants it — the
    // email is stored unverified and confirmed by its own OTP afterwards.
    const emailLooksVit = Boolean(body.email?.endsWith(`@${vitDomain}`))

    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          fullName: body.fullName,
          phone: body.phone,
          phoneVerifiedAt: new Date(),
          email: body.email ?? null,
          role: body.role,
          department: body.department ?? null,
          year: body.year ?? null,
          bio: body.bio ?? null,
          avatarUrl: body.avatarUrl ?? null,
          isVitVerified: false,
          settings: { create: {} },
        },
        select: { id: true, fullName: true, role: true },
      })

      if (body.role === 'HOSTELLER' && body.hostelLocation) {
        await tx.hostelLocation.create({
          data: { userId: created.id, ...body.hostelLocation },
        })
      }

      if (body.role !== 'HOSTELLER' && body.geoLocation) {
        await tx.geoLocation.create({
          data: { userId: created.id, ...body.geoLocation },
        })
      }

      // Referrals are tracked now; rewards are paid out once that feature ships.
      if (body.referralCode) {
        const referral = await tx.referral.findUnique({
          where: { code: body.referralCode.toUpperCase() },
          select: { id: true, inviteeId: true, inviterId: true },
        })
        if (referral && !referral.inviteeId && referral.inviterId !== created.id) {
          await tx.referral.update({
            where: { id: referral.id },
            data: { inviteeId: created.id, redeemedAt: new Date() },
          })
        }
      }

      // Invalidate the proof OTP so it cannot be reused.
      await tx.otpCode.update({
        where: { id: proof.id },
        data: { consumedAt: new Date(0) },
      })

      return created
    })

    const tokens = await createSession(user.id, meta)

    const response = ok({
      created: true,
      user,
      // Tells the UI to offer email verification for the badge.
      emailNeedsVerification: emailLooksVit,
    })

    return setAuthCookies(response, tokens)
  })
}
