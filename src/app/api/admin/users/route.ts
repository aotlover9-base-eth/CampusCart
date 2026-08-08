import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { Prisma } from '@/generated/prisma/client'
import { fail, handler, mutation, ok, parseBody, parseQuery } from '@/lib/api'
import { auditLog, requireAdmin, requireAdminRole } from '@/lib/admin/auth'
import { cursorPaginationSchema } from '@/lib/validation'
import { db } from '@/lib/db'

/**
 * GET   /api/admin/users — search and page through accounts
 * PATCH /api/admin/users — ban, suspend, reinstate, verify, or delete
 *
 * Reads are open to any admin; writes need MODERATOR or above, and deletion
 * needs SUPER_ADMIN. Every write lands in the audit log with a before/after
 * snapshot so an action can be traced and reversed.
 */

const querySchema = cursorPaginationSchema.extend({
  q: z.string().trim().max(120).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'BANNED', 'DELETED']).optional(),
})

export async function GET(request: Request): Promise<NextResponse> {
  return handler(async () => {
    await requireAdmin()
    const { cursor, limit, q, status } = parseQuery(request, querySchema)

    const where: Prisma.UserWhereInput = {
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              // Exact match only: a partial phone search would turn this into a
              // lookup tool for numbers the admin has no specific reason to see.
              { phone: q },
            ],
          }
        : {}),
    }

    const rows = await db.user.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        department: true,
        year: true,
        avatarUrl: true,
        status: true,
        statusReason: true,
        suspendedTill: true,
        isVitVerified: true,
        listingCount: true,
        soldCount: true,
        createdAt: true,
        lastSeenAt: true,
        _count: { select: { reportsAgainst: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    })

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows

    return ok({
      users: page.map((user) => ({
        ...user,
        reportCount: user._count.reportsAgainst,
        createdAt: user.createdAt.toISOString(),
        lastSeenAt: user.lastSeenAt.toISOString(),
        suspendedTill: user.suspendedTill?.toISOString() ?? null,
      })),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
      hasMore,
    })
  })
}

const patchSchema = z.object({
  userId: z.string().min(1),
  action: z.enum(['ban', 'suspend', 'reinstate', 'verify', 'unverify', 'delete']),
  reason: z.string().trim().max(300).optional(),
  /** Suspension length. Defaults to a week. */
  days: z.coerce.number().int().min(1).max(365).optional(),
})

export async function PATCH(request: Request): Promise<NextResponse> {
  return mutation(async () => {
    const body = await parseBody(request, patchSchema)

    // Deleting an account is irreversible in effect, so it is the one action
    // reserved to SUPER_ADMIN.
    const admin =
      body.action === 'delete'
        ? await requireAdminRole()
        : await requireAdminRole('MODERATOR', 'SUPPORT')

    const before = await db.user.findUnique({
      where: { id: body.userId },
      select: { id: true, fullName: true, status: true, isVitVerified: true },
    })
    if (!before) return fail('User not found', 404)

    const data: Prisma.UserUpdateInput = {}
    let summary = ''

    switch (body.action) {
      case 'ban':
        data.status = 'BANNED'
        data.statusReason = body.reason ?? null
        data.suspendedTill = null
        summary = `Banned ${before.fullName}`
        break
      case 'suspend':
        data.status = 'SUSPENDED'
        data.statusReason = body.reason ?? null
        data.suspendedTill = new Date(Date.now() + (body.days ?? 7) * 86_400_000)
        summary = `Suspended ${before.fullName} for ${body.days ?? 7} days`
        break
      case 'reinstate':
        data.status = 'ACTIVE'
        data.statusReason = null
        data.suspendedTill = null
        summary = `Reinstated ${before.fullName}`
        break
      case 'verify':
        data.isVitVerified = true
        summary = `Verified ${before.fullName}`
        break
      case 'unverify':
        data.isVitVerified = false
        summary = `Removed verification from ${before.fullName}`
        break
      case 'delete':
        // Soft delete: the row stays so their listings and chat history keep
        // their foreign keys, but every read path filters on deletedAt.
        data.status = 'DELETED'
        data.deletedAt = new Date()
        data.statusReason = body.reason ?? null
        summary = `Deleted ${before.fullName}`
        break
    }

    await db.user.update({ where: { id: body.userId }, data })

    // A banned or deleted account must not stay signed in anywhere.
    if (['ban', 'delete', 'suspend'].includes(body.action)) {
      await db.session.updateMany({
        where: { userId: body.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
    }

    void auditLog({
      adminId: admin.id,
      action: `user.${body.action}`,
      entityType: 'user',
      entityId: body.userId,
      summary,
      metadata: {
        before: { status: before.status, isVitVerified: before.isVitVerified },
        reason: body.reason ?? null,
      },
    })

    return ok({ updated: true })
  })
}
