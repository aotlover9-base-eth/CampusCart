import type { SerializedMessage } from '@/lib/conversations'

/**
 * A message as the thread renders it.
 *
 * The serializer already emits ISO strings, so the only additions here are the
 * two states the server has no concept of: `pending` (sent, not yet
 * acknowledged) and `failed` (the request errored).
 */
export interface ChatMessage extends SerializedMessage {
  pending?: boolean
  failed?: boolean
}

/** Temporary id for an unacknowledged send. Prefixed so it can never collide. */
export function temporaryId(): string {
  return `pending-${Math.random().toString(36).slice(2)}-${Date.now()}`
}

export function isTemporary(id: string): boolean {
  return id.startsWith('pending-')
}
