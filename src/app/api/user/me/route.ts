import { NextResponse } from 'next/server'
import { z } from 'zod'
import { handler, mutation, ok, parseBody } from '@/lib/api'
import { requireUser } from '@/lib/auth/context'
import { getSessionUser } from '@/lib/auth/session-user'
import {
  departmentSchema,
  fullNameSchema,
  geoLocationSchema,
  hostelLocationSchema,
  yearSchema,
} from '@/lib/validation'
import { db } from '@/lib/db'

/**
 * GET   /api/user/me — the signed-in user's own profile
 * PATCH /api/user/me — update profile, settings, or pickup location
 *
 * Separate from /api/user/[userId], which is the redacted public view. Here the
 * caller is the subject, so their own phone and exact location are fair game.
 */

const updateSchema = z.object({
  fullName: fullNameSchema.optional(),
  department: departmentSchema,
  year: yearSchema,
  bio: z.string().trim().max(280).nullable().optional(),
  // Produced by /api/upload, which returns either a root-relative local path or
  // an absolute CDN URL. Anything else is rejected so a listing image URL cannot
  // be swapped for an off-site tracker.
  avatarUrl: z
    .string()
    .max(500)
    .refine(
      (value) => value.startsWith('/uploads/') || /^https:\/\//.test(value),
      'Invalid image reference',
    )
    .nullable()
    .optional(),

  settings: z
    .object({
      showRole: z.boolean().optional(),
      showDepartment: z.boolean().optional(),
      requirePhoneApproval: z.boolean().optional(),
      notifyNewMessage: z.boolean().optional(),
      notifyOffers: z.boolean().optional(),
      notifyPhoneRequests: z.boolean().optional(),
      notifyAnnouncements: z.boolean().optional(),
      emailDigest: z.boolean().optional(),
      theme: z.enum(['light', 'dark', 'system']).optional(),
    })
    .optional(),

  hostelLocation: hostelLocationSchema.optional(),
  geoLocation: geoLocationSchema.optional(),
})

export async function GET(): Promise<NextResponse> {
  return handler(async () => {
    await requireUser()
    return ok({ user: await getSessionUser() })
  })
}

export async function PATCH(request: Request): Promise<NextResponse> {
  return mutation(async () => {
    const auth = await requireUser()
    const body = await parseBody(request, updateSchema)

    await db.$transaction(async (tx) => {
      const profileFields = {
        ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
        ...(body.department !== undefined ? { department: body.department } : {}),
        ...(body.year !== undefined ? { year: body.year } : {}),
        ...(body.bio !== undefined ? { bio: body.bio } : {}),
        ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
      }

      if (Object.keys(profileFields).length > 0) {
        await tx.user.update({ where: { id: auth.id }, data: profileFields })
      }

      if (body.settings) {
        await tx.userSettings.upsert({
          where: { userId: auth.id },
          update: body.settings,
          create: { userId: auth.id, ...body.settings },
        })
      }

      // Location is keyed to the user's role: hostellers keep a block, everyone
      // else keeps coordinates. Writing the row that matches the caller's role
      // means a role switch cannot leave two conflicting pickup points live.
      if (body.hostelLocation) {
        await tx.hostelLocation.upsert({
          where: { userId: auth.id },
          update: body.hostelLocation,
          create: { userId: auth.id, ...body.hostelLocation },
        })
      }

      if (body.geoLocation) {
        await tx.geoLocation.upsert({
          where: { userId: auth.id },
          update: body.geoLocation,
          create: { userId: auth.id, ...body.geoLocation },
        })
      }
    })

    return ok({ user: await getSessionUser() })
  })
}
