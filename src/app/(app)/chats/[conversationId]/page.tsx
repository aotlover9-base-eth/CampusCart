import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/session-user'
import { db } from '@/lib/db'
import {
  conversationListSelect,
  messageSelect,
  serializeConversation,
  serializeMessage,
} from '@/lib/conversations'
import { ChatThread } from '@/components/chat/chat-thread'

export const metadata: Metadata = {
  title: 'Chat',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

const INITIAL_MESSAGES = 30

interface Props {
  params: Promise<{ conversationId: string }>
}

/**
 * Thread view.
 *
 * The first page of messages is server-rendered so the conversation is readable
 * on arrival rather than after a client fetch. Everything past that — older
 * history, new messages, typing, receipts — is handled client-side.
 */
export default async function ChatPage({ params }: Props) {
  const { conversationId } = await params
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, members: { some: { userId: user.id } } },
    select: conversationListSelect,
  })

  // Not a member: 404, so thread ids cannot be probed.
  if (!conversation) notFound()

  const member = await db.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId: user.id } },
    select: { unreadCount: true, isArchived: true, isMuted: true, clearedAt: true },
  })

  const rows = await db.message.findMany({
    where: {
      conversationId,
      ...(member?.clearedAt ? { createdAt: { gt: member.clearedAt } } : {}),
    },
    select: messageSelect,
    orderBy: { createdAt: 'desc' },
    take: INITIAL_MESSAGES + 1,
  })

  const hasMore = rows.length > INITIAL_MESSAGES
  const page = hasMore ? rows.slice(0, INITIAL_MESSAGES) : rows

  const otherId =
    conversation.buyerId === user.id ? conversation.sellerId : conversation.buyerId

  const block = await db.userBlock.findFirst({
    where: {
      OR: [
        { actorId: user.id, targetId: otherId },
        { actorId: otherId, targetId: user.id },
      ],
    },
    select: { actorId: true },
  })

  // Opening the thread is what marks it read.
  if (member && member.unreadCount > 0) {
    const now = new Date()
    await db.$transaction([
      db.conversationMember.update({
        where: { conversationId_userId: { conversationId, userId: user.id } },
        data: { unreadCount: 0, lastReadAt: now },
      }),
      db.message.updateMany({
        where: { conversationId, senderId: { not: user.id }, readAt: null },
        data: { readAt: now, deliveryState: 'READ' },
      }),
    ])
  }

  return (
    <ChatThread
      conversation={serializeConversation(conversation, user.id, member)}
      initialMessages={page.map((row) => serializeMessage(row, user.id)).reverse()}
      initialCursor={hasMore ? (page.at(-1)?.id ?? null) : null}
      hasMoreInitially={hasMore}
      viewerId={user.id}
      blocked={block ? { byMe: block.actorId === user.id } : null}
    />
  )
}
