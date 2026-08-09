import { NextResponse } from 'next/server'
import { z } from 'zod'
import { fail, mutation, ok, parseBody } from '@/lib/api'
import { requireUser } from '@/lib/auth/context'
import { writeLimiter } from '@/lib/rate-limit'
import { db } from '@/lib/db'

/**
 * POST /api/reports
 *
 * Files a report against a listing, user, message, or conversation.
 *
 * Filing a report is what authorises later admin access to an otherwise private
 * conversation, so the moderation window is stamped here rather than left open:
 * `moderationAccessExpiresAt` bounds how long that access stays valid.
 */

const MODERATION_WINDOW_DAYS = 30

const reportSchema = z
  .object({
    targetType: z.enum(['LISTING', 'USER', 'MESSAGE', 'CONVERSATION']),
    reason: z.string().trim().min(2).max(80),
    details: z.string().trim().max(1_000).optional(),
    listingId: z.string().min(1).optional(),
    reportedUserId: z.string().min(1).optional(),
    messageId: z.string().min(1).optional(),
    conversationId: z.string().min(1).optional(),
  })
  .refine(
    (value) =>
      ({
        LISTING: Boolean(value.listingId),
        USER: Boolean(value.reportedUserId),
        MESSAGE: Boolean(value.messageId),
        CONVERSATION: Boolean(value.conversationId),
      })[value.targetType],
    { message: 'Provide the id matching the report target', path: ['targetType'] },
  )

export async function POST(request: Request): Promise<NextResponse> {
  return mutation(async () => {
    const user = await requireUser()

    const limit = await writeLimiter(user.id, 'report')
    if (!limit.allowed) {
      return fail('You have filed several reports already. Try again shortly.', 429)
    }

    const body = await parseBody(request, reportSchema)

    // Confirm the target exists and that the reporter can actually see it, so
    // reports cannot be used to probe for hidden ids.
    const targetExists = await verifyTarget(body, user.id)
    if (!targetExists) return fail('That item no longer exists', 404)

    // Reporting yourself is always a mistake.
    if (body.reportedUserId === user.id) {
      return fail('You cannot report your own account', 400)
    }

    const duplicate = await db.report.findFirst({
      where: {
        reporterId: user.id,
        targetType: body.targetType,
        listingId: body.listingId ?? null,
        reportedUserId: body.reportedUserId ?? null,
        messageId: body.messageId ?? null,
        conversationId: body.conversationId ?? null,
        status: { in: ['OPEN', 'UNDER_REVIEW'] },
      },
      select: { id: true },
    })

    if (duplicate) {
      // Report quietly accepted - telling the user it is a duplicate invites
      // them to file it again under a different reason.
      return ok({ reported: true, reportId: duplicate.id })
    }

    const report = await db.report.create({
      data: {
        reporterId: user.id,
        targetType: body.targetType,
        reason: body.reason,
        details: body.details ?? null,
        listingId: body.listingId ?? null,
        reportedUserId: body.reportedUserId ?? null,
        messageId: body.messageId ?? null,
        conversationId: body.conversationId ?? null,
        moderationAccessExpiresAt: new Date(
          Date.now() + MODERATION_WINDOW_DAYS * 86_400_000,
        ),
      },
      select: { id: true },
    })

    return ok({ reported: true, reportId: report.id }, { status: 201 })
  })
}

/** Each target type resolves against a query the reporter is allowed to run. */
async function verifyTarget(
  body: z.infer<typeof reportSchema>,
  viewerId: string,
): Promise<boolean> {
  switch (body.targetType) {
    case 'LISTING': {
      const row = await db.listing.findFirst({
        where: { id: body.listingId, deletedAt: null },
        select: { id: true },
      })
      return Boolean(row)
    }
    case 'USER': {
      const row = await db.user.findFirst({
        where: { id: body.reportedUserId, deletedAt: null },
        select: { id: true },
      })
      return Boolean(row)
    }
    case 'MESSAGE': {
      // Only a participant may report a message in a thread.
      const row = await db.message.findFirst({
        where: {
          id: body.messageId,
          conversation: { members: { some: { userId: viewerId } } },
        },
        select: { id: true },
      })
      return Boolean(row)
    }
    case 'CONVERSATION': {
      const row = await db.conversation.findFirst({
        where: {
          id: body.conversationId,
          members: { some: { userId: viewerId } },
        },
        select: { id: true },
      })
      return Boolean(row)
    }
    default:
      return false
  }
}
