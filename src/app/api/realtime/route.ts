import { getSessionUser } from '@/lib/auth/session-user'
import { subscribeAll, type RealtimeEvent } from '@/lib/realtime'
import { db } from '@/lib/db'

/**
 * GET /api/realtime — server-sent events for messages, typing, and notifications.
 *
 * SSE rather than WebSockets: the payload is one-directional (the client posts
 * through normal routes), it survives proxies that mangle upgrades, and browsers
 * reconnect on their own. Typing indicators POST to /api/realtime/typing.
 *
 * Subscribes to `user:<id>` always, plus `conversation:<id>` when the client
 * passes ?conversation= for the thread it currently has open.
 */

export const dynamic = 'force-dynamic'
// Node runtime: the in-process pub/sub and Prisma both need it.
export const runtime = 'nodejs'

const HEARTBEAT_MS = 25_000

export async function GET(request: Request): Promise<Response> {
  const user = await getSessionUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Captured once so the stream callbacks below close over a plain string
  // rather than a possibly-null object.
  const userId = user.id

  const url = new URL(request.url)
  const conversationId = url.searchParams.get('conversation')

  const channels = [`user:${userId}`]

  // Only subscribe to a thread the user is actually a member of, otherwise the
  // query parameter would be an eavesdropping primitive.
  if (conversationId) {
    const member = await db.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { id: true },
    })
    if (member) channels.push(`conversation:${conversationId}`)
  }

  const encoder = new TextEncoder()
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let unsubscribe: (() => void) | undefined
  let presence: ReturnType<typeof setInterval> | undefined

  const stream = new ReadableStream({
    start(controller) {
      let closed = false

      function send(payload: string) {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(payload))
        } catch {
          closed = true
        }
      }

      function emit(event: RealtimeEvent) {
        send(`data: ${JSON.stringify(event)}\n\n`)
      }

      // Tells the browser to wait 3s before reconnecting, and opens the stream
      // so the client's onopen fires immediately.
      send('retry: 3000\n\n')
      emit({ type: 'ready', channels })

      unsubscribe = subscribeAll(channels, emit)

      // Comment frames keep proxies and load balancers from idling us out.
      heartbeat = setInterval(() => send(': ping\n\n'), HEARTBEAT_MS)

      // An open stream is the best available signal that the user is present.
      let lastTouch = 0
      const touch = () => {
        const now = Date.now()
        if (now - lastTouch < 300_000) return
        lastTouch = now
        void db.user
          .update({ where: { id: userId }, data: { lastSeenAt: new Date(), isOnline: true } })
          .catch(() => {})
      }
      touch()
      presence = setInterval(touch, 120_000)

      // Client navigated away or the connection dropped.
      request.signal.addEventListener('abort', () => {
        closed = true
        cleanup()
        try {
          controller.close()
        } catch {
          // Already closed.
        }
      })
    },

    cancel() {
      cleanup()
    },
  })

  function cleanup() {
    unsubscribe?.()
    if (heartbeat) clearInterval(heartbeat)
    if (presence) clearInterval(presence)
    void db.user
      .update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
      .catch(() => {})
  }

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Disables proxy buffering, which would otherwise hold events back.
      'X-Accel-Buffering': 'no',
    },
  })
}
