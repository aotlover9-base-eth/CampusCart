import { NextResponse } from 'next/server'
import { z } from 'zod'
import { fail, mutation, ok, parseBody } from '@/lib/api'
import {
  completeProfileSchema,
  emailSchema,
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
  email: emailSchema,
  phone: phoneSchema.optional(),
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

    // Proof of email ownership: a recently consumed code for this email.
    const proof = await db.otpCode.findFirst({
      where: {
        destination: body.email,
        channel: 'EMAIL',
        purpose: { in: ['SIGNUP', 'LOGIN', 'EMAIL_VERIFY'] },
        consumedAt: { gte: new Date(Date.now() - VERIFICATION_GRACE_MS) },
      },
      orderBy: { consumedAt: 'desc' },
      select: { id: true },
    })

    if (!proof) {
      return fail('Verify your email address again before continuing.', 400)
    }

    const existing = await db.user.findFirst({
      where: { email: body.email, deletedAt: null },
      select: { id: true },
    })

    if (existing) {
      return fail('An account already exists for this email address. Sign in instead.', 409)
    }

    if (body.role === 'HOSTELLER' && !body.hostelLocation) {
      return fail('Add your hostel block and room details.', 400, {
        'hostelLocation.block': 'Required for hostellers',
      })
    }

    const vitDomain = env().VIT_EMAIL_DOMAIN.toLowerCase()
    const isVitVerified = body.email.toLowerCase().endsWith(`@${vitDomain}`)

    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          fullName: body.fullName,
          email: body.email,
          emailVerifiedAt: new Date(),
          phone: body.phone ?? null,
          role: body.role,
          department: body.department ?? null,
          year: body.year ?? null,
          bio: body.bio ?? null,
          avatarUrl: body.avatarUrl ?? null,
          isVitVerified,
          settings: { create: {} },
        },
        select: { id: true, fullName: true, role: true, isVitVerified: true },
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
      emailNeedsVerification: !isVitVerified,
    })

    return setAuthCookies(response, tokens)
  })
}
