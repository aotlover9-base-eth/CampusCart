import type { Metadata } from 'next'
import { OfflineNotice } from './offline-notice'

export const metadata: Metadata = {
  title: 'Offline',
  robots: { index: false, follow: false },
}

/**
 * Served by the service worker when a navigation fails with no network.
 *
 * Must be fully static - it has to render from cache with nothing available.
 */
export default function OfflinePage() {
  return <OfflineNotice />
}
