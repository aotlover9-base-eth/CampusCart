import { NextResponse } from 'next/server'
import { z } from 'zod'
import { handler, ok, parseQuery } from '@/lib/api'
import { requireAdminRole } from '@/lib/admin/auth'
import { cursorPaginationSchema } from '@/lib/validation'
import { db } from '@/lib/db'

/**
 * GET /api/admin/logs — the audit trail.
 *
 * SUPER_ADMIN only. The trail exists to hold admins accountable, so a moderator
 * cannot read (or, since the table is append-only, edit) the record of their own
 * actions.
 *
 * Chat-access reads are interleaved here, because "who read a private
 * conversation" is the entry most worth surfacing.
 */

const querySchema = cursorPaginationSchema.extend({
  action: z.string().trim().max(60).optional(),
  adminId: z.string().max(40).optional(),
})

export async function GET(request: Request): Promise<NextResponse> {
  return handler(async () => {
    await requireAdminRole()
    const { cursor, limit, action, adminId } = parseQuery(request, querySchema)

    const [logs, chatAccess] = await Promise.all([
      db.auditLog.findMany({
        where: {
          ...(action ? { action: { startsWith: action } } : {}),
          ...(adminId ? { adminId } : {}),
        },
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          summary: true,
          metadata: true,
          createdAt: true,
          admin: { select: { id: true, username: true, role: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      }),
      // Only on the first page — this is context, not a second paginated list.
      cursor
        ? Promise.resolve([])
        : db.chatAccessLog.findMany({
            select: {
              id: true,
              conversationId: true,
              reportId: true,
              messageCount: true,
              justification: true,
              createdAt: true,
              admin: { select: { username: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
          }),
    ])

    const hasMore = logs.length > limit
    const page = hasMore ? logs.slice(0, limit) : logs

    return ok({
      logs: page.map((log) => ({
        ...log,
        createdAt: log.createdAt.toISOString(),
      })),
      chatAccess: chatAccess.map((entry) => ({
        ...entry,
        createdAt: entry.createdAt.toISOString(),
      })),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
      hasMore,
    })
  })
}
