import { NextResponse } from 'next/server'
import { z } from 'zod'
import { fail, handler, mutation, ok, parseBody, parseQuery } from '@/lib/api'
import { requireUser } from '@/lib/auth/context'
import { writeLimiter } from '@/lib/rate-limit'
import { cursorPaginationSchema } from '@/lib/validation'
import { db } from '@/lib/db'
import {
  isBlockedBetween,
  messagePreview,
  messageSelect,
  serializeMessage,
} from '@/lib/conversations'
import { notifyNewMessage } from '@/lib/notifications'
import { publish } from '@/lib/realtime'

/**
 * GET  /api/conversations/[conversationId]/messages - thread history
 * POST /api/conversations/[conversationId]/messages - send a message
 *
 * History is newest-first for cursor pagination, then reversed for display, so
 * "load older" fetches a page without re-reading the whole thread.
 */

interface Props {
  params: Promise<{ conversationId: string }>
}

/** Confirms membership and returns both sides of the thread. */
async function loadMembership(conversationId: string, userId: string) {
  return db.conversation.findFirst({
    where: { id: conversationId, members: { some: { userId } } },
    select: {
      id: true,
      buyerId: true,
      sellerId: true,
      listingId: true,
      members: {
        where: { userId },
        select: { clearedAt: true, lastReadAt: true },
      },
    },
  })
}

export async function GET(request: Request, props: Props): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser()
    const { conversationId } = await props.params
    const { cursor, limit } = parseQuery(request, cursorPaginationSchema)

    const conversation = await loadMembership(conversationId, user.id)
    // 404 rather than 403: a non-member should not learn the thread exists.
    if (!conversation) return fail('Conversation not found', 404)

    const clearedAt = conversation.members[0]?.clearedAt ?? null

    const rows = await db.message.findMany({
      where: {
        conversationId,
        // A one-sided clear hides history before that moment for this user only.
        ...(clearedAt ? { createdAt: { gt: clearedAt } } : {}),
      },
      select: messageSelect,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    })

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows

    return ok({
      // Reversed so the client renders oldest-to-newest without re-sorting.
      messages: page.map((row) => serializeMessage(row, user.id)).reverse(),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
      hasMore,
    })
  })
}

const sendSchema = z
  .object({
    body: z.string().trim().max(4_000).optional(),
    // Minted by /api/upload; the same shape the listing composer submits.
    mediaKey: z.string().regex(/^[a-f0-9]{16}\.[a-z0-9]{2,5}$/i).optional(),
    mediaThumbKey: z.string().regex(/^[a-f0-9]{16}\.[a-z0-9]{2,5}$/i).optional(),
    mediaWidth: z.coerce.number().int().positive().optional(),
    mediaHeight: z.coerce.number().int().positive().optional(),
    mediaBlurUrl: z.string().max(3_000).optional(),
  })
  .refine((value) => Boolean(value.body?.length) || Boolean(value.mediaKey), {
    message: 'Write something or attach a photo',
    path: ['body'],
  })

export async function POST(request: Request, props: Props): Promise<NextResponse> {
  return mutation(async () => {
    const user = await requireUser()
    const { conversationId } = await props.params

    const limit = await writeLimiter(user.id, 'message')
    if (!limit.allowed) {
      return fail('You are sending messages too quickly.', 429)
    }

    const conversation = await loadMembership(conversationId, user.id)
    if (!conversation) return fail('Conversation not found', 404)

    const otherId =
      conversation.buyerId === user.id ? conversation.sellerId : conversation.buyerId

    if (await isBlockedBetween(user.id, otherId)) {
      return fail('You cannot message this person', 403)
    }

    const body = await parseBody(request, sendSchema)
    const kind = body.mediaKey ? 'IMAGE' : 'TEXT'
    const preview = messagePreview(kind, body.body ?? null)

    const message = await db.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId,
          senderId: user.id,
          kind,
          body: body.body ?? null,
          mediaKey: body.mediaKey ?? null,
          mediaThumbKey: body.mediaThumbKey ?? null,
          mediaWidth: body.mediaWidth ?? null,
          mediaHeight: body.mediaHeight ?? null,
          mediaBlurUrl: body.mediaBlurUrl ?? null,
          deliveryState: 'SENT',
        },
        select: messageSelect,
      })

      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: created.createdAt, lastMessagePreview: preview },
      })

      // Only the recipient's unread count moves, and an archived thread
      // resurfaces for them.
      await tx.conversationMember.updateMany({
        where: { conversationId, userId: otherId },
        data: { unreadCount: { increment: 1 }, isArchived: false },
      })

      // The sender has by definition read their own message.
      await tx.conversationMember.updateMany({
        where: { conversationId, userId: user.id },
        data: { lastReadAt: created.createdAt, unreadCount: 0 },
      })

      return created
    })

    const serialized = serializeMessage(message, user.id)

    // Live delivery for anyone with the thread open; the notification is the
    // fallback for everyone else.
    publish(`conversation:${conversationId}`, {
      type: 'message',
      message: serializeMessage(message, otherId),
    })
    publish(`user:${otherId}`, { type: 'conversation-updated', conversationId })

    void notifyNewMessage({
      recipientId: otherId,
      senderId: user.id,
      senderName: user.fullName,
      conversationId,
      preview,
    })

    return ok({ message: serialized }, { status: 201 })
  })
}
