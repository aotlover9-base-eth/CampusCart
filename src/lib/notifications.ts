import type { NotificationKind } from '@/generated/prisma/enums'
import { db } from './db'

/**
 * Notification creation.
 *
 * Every kind funnels through `notify` so respecting the recipient's preferences
 * is impossible to forget: a caller cannot bypass the settings check by writing
 * to the table directly if it never does.
 */

interface NotifyInput {
  userId: string
  kind: NotificationKind
  title: string
  body?: string
  href?: string
  entityType?: string
  entityId?: string
  actorId?: string
}

/** Which preference column, if any, gates a given kind. */
const PREFERENCE_FOR_KIND: Partial<Record<NotificationKind, string>> = {
  NEW_MESSAGE: 'notifyNewMessage',
  OFFER_RECEIVED: 'notifyOffers',
  OFFER_ACCEPTED: 'notifyOffers',
  OFFER_REJECTED: 'notifyOffers',
  PHONE_REQUEST_RECEIVED: 'notifyPhoneRequests',
  PHONE_REQUEST_ACCEPTED: 'notifyPhoneRequests',
  PHONE_REQUEST_REJECTED: 'notifyPhoneRequests',
  ANNOUNCEMENT: 'notifyAnnouncements',
}

/**
 * Create a notification, honouring the recipient's settings.
 *
 * Never throws: a notification failing is not a reason for the action that
 * triggered it to fail, so callers can fire-and-forget.
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    // Never notify someone about their own action.
    if (input.actorId && input.actorId === input.userId) return

    const preferenceKey = PREFERENCE_FOR_KIND[input.kind]

    if (preferenceKey) {
      const settings = await db.userSettings.findUnique({
        where: { userId: input.userId },
        select: { [preferenceKey]: true } as Record<string, true>,
      })

      // Absent settings means defaults, which are all on — so only an explicit
      // `false` suppresses the notification.
      if (settings && (settings as Record<string, boolean>)[preferenceKey] === false) {
        return
      }
    }

    await db.notification.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        title: input.title,
        body: input.body ?? null,
        href: input.href ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        actorId: input.actorId ?? null,
      },
    })
  } catch (error) {
    console.error('[notify] failed:', error)
  }
}

/**
 * Collapse repeat message notifications.
 *
 * A ten-message burst should leave one unread badge, not ten rows. If an unread
 * NEW_MESSAGE for this conversation already exists, refresh it instead.
 */
export async function notifyNewMessage(input: {
  recipientId: string
  senderId: string
  senderName: string
  conversationId: string
  preview: string
}): Promise<void> {
  try {
    const existing = await db.notification.findFirst({
      where: {
        userId: input.recipientId,
        kind: 'NEW_MESSAGE',
        entityId: input.conversationId,
        readAt: null,
      },
      select: { id: true },
    })

    if (existing) {
      await db.notification.update({
        where: { id: existing.id },
        data: { body: input.preview, createdAt: new Date() },
      })
      return
    }

    await notify({
      userId: input.recipientId,
      kind: 'NEW_MESSAGE',
      title: input.senderName,
      body: input.preview,
      href: `/chats/${input.conversationId}`,
      entityType: 'conversation',
      entityId: input.conversationId,
      actorId: input.senderId,
    })
  } catch (error) {
    console.error('[notifyNewMessage] failed:', error)
  }
}
