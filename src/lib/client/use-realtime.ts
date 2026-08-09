'use client'

import { useEffect, useRef } from 'react'

/**
 * Subscribes to the SSE stream and dispatches events to a handler.
 *
 * EventSource reconnects on its own, so there is no retry logic here - the
 * server sends a `retry:` hint and the browser honours it. The handler is held
 * in a ref so a caller passing an inline arrow doesn't tear down and rebuild the
 * connection on every render.
 */

export interface RealtimeEvent {
  type: string
  [key: string]: unknown
}

export function useRealtime(
  onEvent: (event: RealtimeEvent) => void,
  options: { conversationId?: string; enabled?: boolean } = {},
): void {
  const { conversationId, enabled = true } = options

  const handlerRef = useRef(onEvent)
  handlerRef.current = onEvent

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return

    const url = conversationId
      ? `/api/realtime?conversation=${encodeURIComponent(conversationId)}`
      : '/api/realtime'

    const source = new EventSource(url, { withCredentials: true })

    source.onmessage = (event) => {
      try {
        handlerRef.current(JSON.parse(event.data) as RealtimeEvent)
      } catch {
        // A malformed frame is not worth tearing the stream down over.
      }
    }

    // EventSource reports every disconnect as an error, including the ordinary
    // ones it is about to recover from. Reconnection is automatic, so this is
    // deliberately silent.
    source.onerror = () => {}

    return () => source.close()
  }, [conversationId, enabled])
}
