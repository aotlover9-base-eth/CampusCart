import type { Metadata } from 'next'
import { AdminReports } from '@/components/admin/admin-reports'

export const metadata: Metadata = {
  title: 'Reports',
  robots: { index: false, follow: false, nocache: true },
}

export const dynamic = 'force-dynamic'

export default function AdminReportsPage() {
  return <AdminReports />
}
