import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/session-user'
import { RequestsInbox } from '@/components/requests/requests-inbox'

export const metadata: Metadata = {
  title: 'Offers',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/**
 * Seller inbox for offers and phone requests.
 *
 * Both live here rather than in chat because they need a decision, not a reply,
 * and a seller with several listings wants them in one queue.
 */
export default async function RequestsPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login?next=/requests')

  return <RequestsInbox />
}
