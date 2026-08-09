import { NextResponse } from 'next/server'
import { z } from 'zod'
import { fail, mutation, ok, parseBody } from '@/lib/api'
import { requireUser } from '@/lib/auth/context'
import { db } from '@/lib/db'
import { publish } from '@/lib/realtime'

/**
 * POST /api/realtime/typing - broadcast a typing indicator.
 *
 * Fire-and-forget and intentionally not persisted: a typing state that outlives
 * the request is worse than none. The client re-posts every few seconds while
 * the user types and posts `typing: false` on blur or send.
 *
 * Goes through `mutation` like every other write. The blast radius of a forged
 * typing frame is small, but "small" is not a reason for one route to be the
 * exception - a uniform rule is what makes the rule checkable.
 */

const schema = z.object({
  conversationId: z.string().min(1),
  typing: z.boolean(),
})

export async function POST(request: Request): Promise<NextResponse> {
  return mutation(async () => {
    const user = await requireUser()
    const body = await parseBody(request, schema)

    const member = await db.conversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId: body.conversationId, userId: user.id },
      },
      select: { id: true },
    })
    if (!member) return fail('Conversation not found', 404)

    publish(`conversation:${body.conversationId}`, {
      type: 'typing',
      conversationId: body.conversationId,
      userId: user.id,
      name: user.fullName,
      typing: body.typing,
    })

    return ok({ ok: true })
  })
}
