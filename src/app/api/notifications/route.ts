import { NextResponse } from 'next/server'
import { z } from 'zod'
import { handler, mutation, ok, parseBody, parseQuery } from '@/lib/api'
import { requireUser } from '@/lib/auth/context'
import { cursorPaginationSchema } from '@/lib/validation'
import { db } from '@/lib/db'

/**
 * GET   /api/notifications - paginated feed plus unread count
 * PATCH /api/notifications - mark some or all as read
 */

export async function GET(request: Request): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser()
    const { cursor, limit } = parseQuery(request, cursorPaginationSchema)

    const [rows, unreadCount] = await Promise.all([
      db.notification.findMany({
        where: { userId: user.id },
        select: {
          id: true,
          kind: true,
          title: true,
          body: true,
          href: true,
          entityType: true,
          entityId: true,
          readAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      }),
      db.notification.count({ where: { userId: user.id, readAt: null } }),
    ])

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows

    return ok({
      notifications: page.map((row) => ({
        ...row,
        readAt: row.readAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      unreadCount,
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
      hasMore,
    })
  })
}

const patchSchema = z.object({
  ids: z.array(z.string().min(1)).max(100).optional(),
  all: z.boolean().optional(),
})

export async function PATCH(request: Request): Promise<NextResponse> {
  return mutation(async () => {
    const user = await requireUser()
    const body = await parseBody(request, patchSchema)

    await db.notification.updateMany({
      // The userId clause is what stops one user marking another's rows read.
      where: {
        userId: user.id,
        readAt: null,
        ...(body.all ? {} : { id: { in: body.ids ?? [] } }),
      },
      data: { readAt: new Date() },
    })

    const unreadCount = await db.notification.count({
      where: { userId: user.id, readAt: null },
    })

    return ok({ unreadCount })
  })
}
