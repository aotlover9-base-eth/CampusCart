import type { Metadata } from 'next'
import { AdminLogs } from '@/components/admin/admin-logs'

export const metadata: Metadata = {
  title: 'Audit log',
  robots: { index: false, follow: false, nocache: true },
}

export const dynamic = 'force-dynamic'

export default function AdminLogsPage() {
  return <AdminLogs />
}
