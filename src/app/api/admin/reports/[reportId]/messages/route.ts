import { NextResponse } from 'next/server'
import { fail, handler, ok } from '@/lib/api'
import { auditLog, requireAdminRole } from '@/lib/admin/auth'
import { hashIp } from '@/lib/crypto'
import { headers } from 'next/headers'
import { db } from '@/lib/db'
import { storage } from '@/lib/storage'

/**
 * GET /api/admin/reports/[reportId]/messages
 *
 * Reads the messages in a reported conversation. This is the most invasive
 * capability in the product, so it is fenced on four sides:
 *
 *  1. MODERATOR or above only.
 *  2. A report must exist and actually name a conversation - there is no way to
 *     read an arbitrary thread by id.
 *  3. The report's moderation window must still be open (30 days from filing).
 *  4. A ChatAccessLog row is written *before* the messages are returned, so a
 *     read cannot happen without leaving a trace. If the log write fails, the
 *     request fails.
 */

interface Props {
  params: Promise<{ reportId: string }>
}

const MAX_MESSAGES = 200

export async function GET(_request: Request, props: Props): Promise<NextResponse> {
  return handler(async () => {
    const admin = await requireAdminRole('MODERATOR')
    const { reportId } = await props.params

    const report = await db.report.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        conversationId: true,
        messageId: true,
        moderationAccessExpiresAt: true,
        reason: true,
      },
    })

    if (!report) return fail('Report not found', 404)

    // A message report implies its parent thread; anything else must name one.
    const conversationId =
      report.conversationId ??
      (report.messageId
        ? (
            await db.message.findUnique({
              where: { id: report.messageId },
              select: { conversationId: true },
            })
          )?.conversationId ?? null
        : null)

    if (!conversationId) {
      return fail('This report does not concern a conversation', 400)
    }

    if (
      !report.moderationAccessExpiresAt ||
      report.moderationAccessExpiresAt < new Date()
    ) {
      return fail('The moderation window for this report has closed', 403)
    }

    const messages = await db.message.findMany({
      where: { conversationId },
      select: {
        id: true,
        senderId: true,
        kind: true,
        body: true,
        mediaKey: true,
        mediaThumbKey: true,
        deletedAt: true,
        createdAt: true,
        sender: { select: { id: true, fullName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_MESSAGES,
    })

    // Written before the response is built. An unrecorded read is not allowed
    // to happen, so a failure here fails the whole request.
    const headerList = await headers()
    await db.chatAccessLog.create({
      data: {
        adminId: admin.id,
        conversationId,
        reportId: report.id,
        messageCount: messages.length,
        justification: `Report review: ${report.reason}`,
        ipHash: hashIp(headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null),
      },
    })

    void auditLog({
      adminId: admin.id,
      action: 'report.chat.read',
      entityType: 'conversation',
      entityId: conversationId,
      summary: `Read ${messages.length} messages while reviewing a report`,
      metadata: { reportId: report.id },
    })

    const store = storage()

    return ok({
      conversationId,
      messages: messages.map((message) => ({
        id: message.id,
        senderId: message.senderId,
        senderName: message.sender.fullName,
        senderAvatar: message.sender.avatarUrl,
        kind: message.kind,
        body: message.deletedAt ? null : message.body,
        isDeleted: message.deletedAt !== null,
        mediaUrl: message.mediaKey
          ? store.url(message.mediaThumbKey ?? message.mediaKey)
          : null,
        createdAt: message.createdAt.toISOString(),
      })),
      accessExpiresAt: report.moderationAccessExpiresAt.toISOString(),
      // Surfaced so the UI can state plainly that this read was recorded.
      accessLogged: true,
    })
  })
}
