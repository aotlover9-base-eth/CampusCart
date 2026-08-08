import type { ReactNode } from 'react'
import { getSessionUser } from '@/lib/auth/session-user'
import { SessionProvider } from '@/components/providers/session-provider'
import { ToastProvider } from '@/components/ui/toast'
import { MobileTabBar, TopNav } from '@/components/nav/top-nav'

/**
 * Shell for public listing pages.
 *
 * Mirrors the (app) layout but deliberately does **not** redirect anonymous
 * visitors: a listing link shared over WhatsApp has to open for someone without
 * an account. `getSessionUser` may return null, and the nav renders a "Sign in"
 * button in that case.
 *
 * The providers are what make this necessary — the detail page calls `useToast`,
 * and without a provider above it every listing page throws.
 */
export default async function ListingLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser()

  return (
    <SessionProvider initialUser={user}>
      <ToastProvider>
        <div className="flex min-h-dvh flex-col">
          <TopNav />

          {/* Bottom padding clears the mobile tab bar, which only renders when
              signed in — anonymous visitors get no wasted space. */}
          <main className={user ? 'flex-1 pb-[calc(var(--nav-height-mobile)+16px)] md:pb-10' : 'flex-1 pb-10'}>
            {children}
          </main>

          <MobileTabBar />
        </div>
      </ToastProvider>
    </SessionProvider>
  )
}
