import type { Metadata } from 'next'
import { AdminCategories } from '@/components/admin/admin-categories'

export const metadata: Metadata = {
  title: 'Categories',
  robots: { index: false, follow: false, nocache: true },
}

export const dynamic = 'force-dynamic'

export default function AdminCategoriesPage() {
  return <AdminCategories />
}
