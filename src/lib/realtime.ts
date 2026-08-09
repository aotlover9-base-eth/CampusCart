/**
 * In-process pub/sub backing the SSE stream.
 *
 * Deliberately simple: a Map of channel → subscriber callbacks, living in the
 * Node process. That is correct for a single instance and for `next dev`, and
 * it degrades safely rather than silently - see the note below.
 *
 * Scaling past one instance means swapping the two functions here for a Redis
 * pub/sub client (or setting REALTIME_DRIVER=socketio and running a dedicated
 * server). Every caller goes through `publish` and `subscribe`, so nothing else
 * changes. Until then, a second instance simply means clients on instance A do
 * not see instance B's events live - they still get them on the next poll or
 * navigation, because the database remains the source of truth.
 */

export interface RealtimeEvent {
  type: string
  [key: string]: unknown
}

type Subscriber = (event: RealtimeEvent) => void

/**
 * Held on globalThis so Next's dev-mode module reloading doesn't orphan live
 * subscribers behind a fresh module instance.
 */
const globalForRealtime = globalThis as unknown as {
  __campuscartChannels?: Map<string, Set<Subscriber>>
}

const channels: Map<string, Set<Subscriber>> =
  globalForRealtime.__campuscartChannels ?? new Map()

if (!globalForRealtime.__campuscartChannels) {
  globalForRealtime.__campuscartChannels = channels
}

/** Broadcast to every subscriber on a channel. Never throws. */
export function publish(channel: string, event: RealtimeEvent): void {
  const subscribers = channels.get(channel)
  if (!subscribers) return

  for (const subscriber of subscribers) {
    try {
      subscriber(event)
    } catch {
      // A dead connection must not stop delivery to the rest of the channel.
    }
  }
}

/** Subscribe to a channel. The returned function unsubscribes. */
export function subscribe(channel: string, subscriber: Subscriber): () => void {
  let subscribers = channels.get(channel)
  if (!subscribers) {
    subscribers = new Set()
    channels.set(channel, subscribers)
  }
  subscribers.add(subscriber)

  return () => {
    subscribers?.delete(subscriber)
    // Drop empty channels so the map doesn't grow without bound.
    if (subscribers?.size === 0) channels.delete(channel)
  }
}

/** Subscribe to several channels at once, e.g. a user plus their open thread. */
export function subscribeAll(
  channelNames: string[],
  subscriber: Subscriber,
): () => void {
  const unsubscribers = channelNames.map((name) => subscribe(name, subscriber))
  return () => unsubscribers.forEach((fn) => fn())
}
