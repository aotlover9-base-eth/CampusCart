import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { adminBasePath, currentAdmin } from '@/lib/admin/auth'
import { AdminShell } from '@/components/admin/admin-shell'
import { ToastProvider } from '@/components/ui/toast'

export const dynamic = 'force-dynamic'

/**
 * Shell for every signed-in admin page.
 *
 * Middleware already redirects a missing cookie, but this re-checks against the
 * database: middleware only sees that a cookie exists, while `currentAdmin`
 * confirms the session is live and the account still active.
 */
export default async function AdminAreaLayout({ children }: { children: ReactNode }) {
  const admin = await currentAdmin()
  if (!admin) redirect(`${adminBasePath()}/login`)

  return (
    <ToastProvider>
      <AdminShell
        admin={{ username: admin.username, role: admin.role }}
        basePath={adminBasePath()}
      >
        {children}
      </AdminShell>
    </ToastProvider>
  )
}
