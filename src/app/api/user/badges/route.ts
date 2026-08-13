import { NextResponse } from 'next/server'
import { handler, ok } from '@/lib/api'
import { currentUser } from '@/lib/auth/context'
import { db } from '@/lib/db'

/**
 * GET /api/user/badges
 *
 * Lightweight background endpoint for navbar unread badges (notifications, chats, offers).
 * Keeping this separate from page render prevents 4 count queries from blocking layout SSR.
 */
export async function GET(): Promise<NextResponse> {
  return handler(async () => {
    const user = await currentUser()
    if (!user) return ok({ unreadNotifications: 0, unreadChats: 0, pendingRequests: 0 })

    const [unreadNotifications, chatAggregate, pendingOffers, pendingPhoneRequests] =
      await Promise.all([
        db.notification.count({ where: { userId: user.id, readAt: null } }),
        db.conversationMember.aggregate({
          where: { userId: user.id, isArchived: false },
          _sum: { unreadCount: true },
        }),
        db.offer.count({
          where: { status: 'PENDING', listing: { sellerId: user.id } },
        }),
        db.phoneRequest.count({ where: { sellerId: user.id, status: 'PENDING' } }),
      ])

    return ok({
      unreadNotifications,
      unreadChats: chatAggregate._sum.unreadCount ?? 0,
      pendingRequests: pendingOffers + pendingPhoneRequests,
    })
  })
}
