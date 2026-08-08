import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/session-user'
import { SessionProvider } from '@/components/providers/session-provider'
import { ToastProvider } from '@/components/ui/toast'
import { MobileTabBar, TopNav } from '@/components/nav/top-nav'

/**
 * Shell for every signed-in surface.
 *
 * Middleware already redirects anonymous visitors, but this re-checks against
 * the database: middleware only sees that a cookie exists, while `getSessionUser`
 * confirms the account is still active and not banned.
 *
 * The user is resolved once here and handed to the client provider, so no page
 * beneath needs its own /api/auth/me round trip.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()

  if (!user) redirect('/login')

  return (
    <SessionProvider initialUser={user}>
      <ToastProvider>
        <div className="flex min-h-dvh flex-col">
          <TopNav />

          {/* Bottom padding clears the mobile tab bar. */}
          <main className="flex-1 pb-[calc(var(--nav-height-mobile)+16px)] md:pb-10">
            {children}
          </main>

          <MobileTabBar />
        </div>
      </ToastProvider>
    </SessionProvider>
  )
}
