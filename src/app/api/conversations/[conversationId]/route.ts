import { NextResponse } from 'next/server'
import { z } from 'zod'
import { fail, handler, mutation, ok, parseBody } from '@/lib/api'
import { requireUser } from '@/lib/auth/context'
import { db } from '@/lib/db'
import { conversationListSelect, serializeConversation } from '@/lib/conversations'
import { publish } from '@/lib/realtime'

/**
 * GET    /api/conversations/[conversationId] — thread metadata
 * PATCH  /api/conversations/[conversationId] — archive, mute, or mark read
 * DELETE /api/conversations/[conversationId] — clear history for the caller
 *
 * Every mutation here is one-sided: archiving, muting, and clearing affect only
 * the member row of the caller, never the other participant's view.
 */

interface Props {
  params: Promise<{ conversationId: string }>
}

export async function GET(_request: Request, props: Props): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser()
    const { conversationId } = await props.params

    const conversation = await db.conversation.findFirst({
      where: { id: conversationId, members: { some: { userId: user.id } } },
      select: conversationListSelect,
    })
    if (!conversation) return fail('Conversation not found', 404)

    const member = await db.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: user.id } },
      select: { unreadCount: true, isArchived: true, isMuted: true },
    })

    const otherId =
      conversation.buyerId === user.id ? conversation.sellerId : conversation.buyerId

    // Surfaced so the thread can show a "you blocked this person" state rather
    // than letting sends fail with no explanation.
    const block = await db.userBlock.findFirst({
      where: {
        OR: [
          { actorId: user.id, targetId: otherId },
          { actorId: otherId, targetId: user.id },
        ],
      },
      select: { actorId: true },
    })

    return ok({
      conversation: serializeConversation(conversation, user.id, member),
      blocked: block ? { byMe: block.actorId === user.id } : null,
    })
  })
}

const patchSchema = z.object({
  isArchived: z.boolean().optional(),
  isMuted: z.boolean().optional(),
  markRead: z.boolean().optional(),
})

export async function PATCH(request: Request, props: Props): Promise<NextResponse> {
  return mutation(async () => {
    const user = await requireUser()
    const { conversationId } = await props.params
    const body = await parseBody(request, patchSchema)

    const member = await db.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: user.id } },
      select: { id: true },
    })
    if (!member) return fail('Conversation not found', 404)

    const updated = await db.conversationMember.update({
      where: { id: member.id },
      data: {
        ...(body.isArchived !== undefined ? { isArchived: body.isArchived } : {}),
        ...(body.isMuted !== undefined ? { isMuted: body.isMuted } : {}),
        ...(body.markRead ? { unreadCount: 0, lastReadAt: new Date() } : {}),
      },
      select: { unreadCount: true, isArchived: true, isMuted: true },
    })

    if (body.markRead) {
      // Stamp the other side's messages so their ticks turn to "read".
      const now = new Date()
      await db.message.updateMany({
        where: { conversationId, senderId: { not: user.id }, readAt: null },
        data: { readAt: now, deliveryState: 'READ' },
      })

      publish(`conversation:${conversationId}`, {
        type: 'read',
        conversationId,
        readerId: user.id,
        readAt: now.toISOString(),
      })
    }

    return ok({ member: updated })
  })
}

export async function DELETE(_request: Request, props: Props): Promise<NextResponse> {
  return mutation(async () => {
    const user = await requireUser()
    const { conversationId } = await props.params

    const member = await db.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: user.id } },
      select: { id: true },
    })
    if (!member) return fail('Conversation not found', 404)

    // Soft, one-sided clear: messages stay for the other participant, and
    // `clearedAt` hides everything before now from this user's history.
    await db.conversationMember.update({
      where: { id: member.id },
      data: { clearedAt: new Date(), unreadCount: 0, isArchived: true },
    })

    return ok({ cleared: true })
  })
}
