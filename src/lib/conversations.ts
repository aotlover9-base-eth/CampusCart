import type { Prisma } from '@/generated/prisma/client'
import { db } from './db'
import { storage } from './storage'

/**
 * Conversation and message read helpers.
 *
 * Threads are keyed on (listing, buyer, seller), so a buyer asking about two
 * different items gets two threads rather than one confusing stream.
 */

export const conversationListSelect = {
  id: true,
  listingId: true,
  buyerId: true,
  sellerId: true,
  lastMessageAt: true,
  lastMessagePreview: true,
  createdAt: true,
  listing: {
    select: {
      id: true,
      title: true,
      priceInPaise: true,
      isFree: true,
      status: true,
      media: {
        orderBy: { sortOrder: 'asc' },
        take: 1,
        select: { storageKey: true, thumbnailKey: true, blurDataUrl: true },
      },
    },
  },
  buyer: {
    select: {
      id: true,
      fullName: true,
      avatarUrl: true,
      isVitVerified: true,
      isOnline: true,
      lastSeenAt: true,
    },
  },
  seller: {
    select: {
      id: true,
      fullName: true,
      avatarUrl: true,
      isVitVerified: true,
      isOnline: true,
      lastSeenAt: true,
    },
  },
} satisfies Prisma.ConversationSelect

export type ConversationRow = Prisma.ConversationGetPayload<{
  select: typeof conversationListSelect
}>

/**
 * Shape a thread from one participant's point of view.
 *
 * The client only ever needs "the other person", so the buyer/seller split is
 * resolved here rather than in every component.
 */
export function serializeConversation(
  row: ConversationRow,
  viewerId: string,
  member?: { unreadCount: number; isArchived: boolean; isMuted: boolean } | null,
) {
  const store = storage()
  const isBuyer = row.buyerId === viewerId
  const other = isBuyer ? row.seller : row.buyer
  const cover = row.listing?.media[0]

  return {
    id: row.id,
    listing: row.listing
      ? {
          id: row.listing.id,
          title: row.listing.title,
          priceInPaise: row.listing.priceInPaise,
          isFree: row.listing.isFree,
          status: row.listing.status,
          thumbnailUrl: cover
            ? store.url(cover.thumbnailKey ?? cover.storageKey)
            : null,
          blurDataUrl: cover?.blurDataUrl ?? null,
        }
      : null,
    other: { ...other, lastSeenAt: other.lastSeenAt.toISOString() },
    // Which side the viewer is on decides whether they can mark an item sold.
    viewerRole: isBuyer ? ('BUYER' as const) : ('SELLER' as const),
    lastMessageAt: row.lastMessageAt.toISOString(),
    lastMessagePreview: row.lastMessagePreview,
    unreadCount: member?.unreadCount ?? 0,
    isArchived: member?.isArchived ?? false,
    isMuted: member?.isMuted ?? false,
    createdAt: row.createdAt.toISOString(),
  }
}

export type SerializedConversation = ReturnType<typeof serializeConversation>

export const messageSelect = {
  id: true,
  conversationId: true,
  senderId: true,
  kind: true,
  body: true,
  mediaKey: true,
  mediaThumbKey: true,
  mediaWidth: true,
  mediaHeight: true,
  mediaBlurUrl: true,
  offerId: true,
  offer: {
    select: {
      id: true,
      amountInPaise: true,
      counterAmountInPaise: true,
      status: true,
      buyerId: true,
      listing: { select: { id: true, title: true, priceInPaise: true } },
    },
  },
  phoneRequestId: true,
  phoneRequest: { select: { id: true, status: true } },
  deliveryState: true,
  deliveredAt: true,
  readAt: true,
  editedAt: true,
  deletedAt: true,
  createdAt: true,
} satisfies Prisma.MessageSelect

export type MessageRow = Prisma.MessageGetPayload<{ select: typeof messageSelect }>

export function serializeMessage(row: MessageRow, viewerId: string) {
  const store = storage()

  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    isMine: row.senderId === viewerId,
    kind: row.kind,
    // A deleted message keeps its slot in the thread but loses its content.
    body: row.deletedAt ? null : row.body,
    isDeleted: row.deletedAt !== null,
    media: row.mediaKey
      ? {
          url: store.url(row.mediaKey),
          thumbnailUrl: row.mediaThumbKey ? store.url(row.mediaThumbKey) : store.url(row.mediaKey),
          width: row.mediaWidth,
          height: row.mediaHeight,
          blurDataUrl: row.mediaBlurUrl,
        }
      : null,
    offerId: row.offerId,
    // Denormalised onto the message so an OFFER bubble can render amount and
    // status — and so the seller can accept or decline without leaving chat.
    offer: row.offer
      ? {
          id: row.offer.id,
          amountInPaise: row.offer.amountInPaise,
          counterAmountInPaise: row.offer.counterAmountInPaise,
          status: row.offer.status,
          // Whether the viewer is the one who must respond.
          isMine: row.offer.buyerId === viewerId,
          listing: row.offer.listing,
        }
      : null,
    phoneRequestId: row.phoneRequestId,
    phoneRequest: row.phoneRequest,
    deliveryState: row.deliveryState,
    readAt: row.readAt?.toISOString() ?? null,
    editedAt: row.editedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

export type SerializedMessage = ReturnType<typeof serializeMessage>

/**
 * Whether two users may message each other.
 *
 * A block in either direction closes the thread for both — the blocker should
 * not receive messages, and the blocked user should not be able to tell that
 * they were blocked by watching their messages fail differently.
 */
export async function isBlockedBetween(a: string, b: string): Promise<boolean> {
  const block = await db.userBlock.findFirst({
    where: {
      OR: [
        { actorId: a, targetId: b },
        { actorId: b, targetId: a },
      ],
    },
    select: { id: true },
  })
  return block !== null
}

/** Short preview stored on the conversation row for the thread list. */
export function messagePreview(kind: string, body: string | null): string {
  switch (kind) {
    case 'IMAGE':
      return 'Photo'
    case 'OFFER':
      return 'Made an offer'
    case 'PHONE_REQUEST':
      return 'Requested phone number'
    case 'SYSTEM':
      return body ?? 'Update'
    default:
      return (body ?? '').slice(0, 120)
  }
}
