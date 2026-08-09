import { NextResponse } from 'next/server'
import { z } from 'zod'
import { fail, handler, mutation, ok, parseBody, parseQuery } from '@/lib/api'
import { auditLog, requireAdmin, requireAdminRole } from '@/lib/admin/auth'
import { cursorPaginationSchema } from '@/lib/validation'
import { db } from '@/lib/db'

/**
 * GET   /api/admin/reports - the moderation queue
 * PATCH /api/admin/reports - resolve or dismiss a report
 */

const querySchema = cursorPaginationSchema.extend({
  status: z.enum(['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED']).optional(),
})

export async function GET(request: Request): Promise<NextResponse> {
  return handler(async () => {
    await requireAdmin()
    const { cursor, limit, status } = parseQuery(request, querySchema)

    const rows = await db.report.findMany({
      // Default to the queue that needs work rather than the whole history.
      where: status ? { status } : { status: { in: ['OPEN', 'UNDER_REVIEW'] } },
      select: {
        id: true,
        targetType: true,
        reason: true,
        details: true,
        status: true,
        createdAt: true,
        resolvedAt: true,
        resolutionNote: true,
        moderationAccessExpiresAt: true,
        conversationId: true,
        reporter: { select: { id: true, fullName: true, avatarUrl: true } },
        listing: { select: { id: true, title: true, status: true } },
        reportedUser: {
          select: { id: true, fullName: true, avatarUrl: true, status: true },
        },
        message: { select: { id: true, body: true, conversationId: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    })

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows

    return ok({
      reports: page.map((report) => ({
        ...report,
        createdAt: report.createdAt.toISOString(),
        resolvedAt: report.resolvedAt?.toISOString() ?? null,
        // Whether the moderation window on a reported chat is still open.
        canReadChat:
          report.conversationId !== null &&
          report.moderationAccessExpiresAt !== null &&
          report.moderationAccessExpiresAt > new Date(),
        moderationAccessExpiresAt:
          report.moderationAccessExpiresAt?.toISOString() ?? null,
      })),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
      hasMore,
    })
  })
}

const patchSchema = z.object({
  reportId: z.string().min(1),
  action: z.enum(['review', 'resolve', 'dismiss']),
  note: z.string().trim().max(500).optional(),
})

export async function PATCH(request: Request): Promise<NextResponse> {
  return mutation(async () => {
    const admin = await requireAdminRole('MODERATOR', 'SUPPORT')
    const body = await parseBody(request, patchSchema)

    const before = await db.report.findUnique({
      where: { id: body.reportId },
      select: { id: true, status: true, reason: true, targetType: true },
    })
    if (!before) return fail('Report not found', 404)

    const status =
      body.action === 'review'
        ? 'UNDER_REVIEW'
        : body.action === 'resolve'
          ? 'RESOLVED'
          : 'DISMISSED'

    await db.report.update({
      where: { id: body.reportId },
      data: {
        status,
        resolutionNote: body.note ?? null,
        ...(body.action === 'review'
          ? {}
          : { resolvedAt: new Date(), resolvedById: admin.id }),
      },
    })

    void auditLog({
      adminId: admin.id,
      action: `report.${body.action}`,
      entityType: 'report',
      entityId: body.reportId,
      summary: `${body.action} report: ${before.reason}`,
      metadata: { before: { status: before.status }, note: body.note ?? null },
    })

    return ok({ status })
  })
}
