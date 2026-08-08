import type { Metadata } from 'next'
import { AdminListings } from '@/components/admin/admin-listings'

export const metadata: Metadata = {
  title: 'Listings',
  robots: { index: false, follow: false, nocache: true },
}

export const dynamic = 'force-dynamic'

export default function AdminListingsPage() {
  return <AdminListings />
}
