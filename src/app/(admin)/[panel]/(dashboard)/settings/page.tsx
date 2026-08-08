import type { Metadata } from 'next'
import { AdminSettings } from '@/components/admin/admin-settings'

export const metadata: Metadata = {
  title: 'Settings',
  robots: { index: false, follow: false, nocache: true },
}

export const dynamic = 'force-dynamic'

export default function AdminSettingsPage() {
  return <AdminSettings />
}
