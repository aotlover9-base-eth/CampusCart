import { NextResponse } from 'next/server'
import { z } from 'zod'
import { fail, handler, mutation, ok, parseBody } from '@/lib/api'
import { requireUser } from '@/lib/auth/context'
import { db } from '@/lib/db'

/**
 * GET    /api/blocks - who the caller has blocked
 * POST   /api/blocks - block a user
 * DELETE /api/blocks?userId= - unblock
 *
 * A block is one-directional in storage but symmetric in effect: `isBlockedBetween`
 * checks both directions, so neither party can message the other afterwards.
 */

export async function GET(): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser()

    const blocks = await db.userBlock.findMany({
      where: { actorId: user.id },
      select: {
        id: true,
        createdAt: true,
        reason: true,
        target: {
          select: { id: true, fullName: true, avatarUrl: true, isVitVerified: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return ok({ blocks })
  })
}

const createSchema = z.object({
  userId: z.string().min(1),
  reason: z.string().trim().max(200).optional(),
})

export async function POST(request: Request): Promise<NextResponse> {
  return mutation(async () => {
    const user = await requireUser()
    const body = await parseBody(request, createSchema)

    if (body.userId === user.id) {
      return fail('You cannot block yourself', 400)
    }

    const target = await db.user.findFirst({
      where: { id: body.userId, deletedAt: null },
      select: { id: true },
    })
    if (!target) return fail('User not found', 404)

    await db.userBlock.upsert({
      where: { actorId_targetId: { actorId: user.id, targetId: body.userId } },
      update: { reason: body.reason ?? null },
      create: { actorId: user.id, targetId: body.userId, reason: body.reason ?? null },
    })

    // Archive any shared threads so the blocked person leaves the caller's inbox.
    await db.conversationMember.updateMany({
      where: {
        userId: user.id,
        conversation: {
          OR: [
            { buyerId: body.userId, sellerId: user.id },
            { buyerId: user.id, sellerId: body.userId },
          ],
        },
      },
      data: { isArchived: true },
    })

    return ok({ blocked: true })
  })
}

export async function DELETE(request: Request): Promise<NextResponse> {
  return mutation(async () => {
    const user = await requireUser()
    const userId = new URL(request.url).searchParams.get('userId')

    if (!userId) return fail('Specify which user to unblock', 400)

    await db.userBlock.deleteMany({ where: { actorId: user.id, targetId: userId } })

    return ok({ blocked: false })
  })
}
