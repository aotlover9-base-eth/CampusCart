import type { Metadata } from 'next'
import { AdminUsers } from '@/components/admin/admin-users'

export const metadata: Metadata = {
  title: 'Users',
  robots: { index: false, follow: false, nocache: true },
}

export const dynamic = 'force-dynamic'

export default function AdminUsersPage() {
  return <AdminUsers />
}
