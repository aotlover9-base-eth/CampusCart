'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '@/lib/client/fetcher'
import type { SessionUser } from '@/lib/auth/context'

/**
 * Client-side view of the signed-in user.
 *
 * Seeded from the server on first render - no loading flash, no request on
 * mount. `refresh()` re-reads /api/auth/me after a profile edit; `patch()`
 * applies an optimistic local change for things like an avatar swap.
 */

interface SessionContextValue {
  user: SessionUser | null
  isSignedIn: boolean
  refresh: () => Promise<void>
  patch: (changes: Partial<SessionUser>) => void
}

const SessionContext = createContext<SessionContextValue | null>(null)


export function SessionProvider({
  initialUser,
  children,
}: {
  initialUser: SessionUser | null
  children: ReactNode
}) {
  const [user, setUser] = useState<SessionUser | null>(initialUser)

  const refresh = useCallback(async () => {
    try {
      const next = await api<{ user: SessionUser | null }>('/api/auth/me')
      setUser(next.user)
    } catch {
      // A failed refresh shouldn't blank the UI; keep the last known user.
    }
  }, [])

  const patch = useCallback((changes: Partial<SessionUser>) => {
    setUser((current) => (current ? { ...current, ...changes } : current))
  }, [])

  // Fetch unread badge counts asynchronously in the background so layout SSR isn't blocked.
  useEffect(() => {
    if (!user?.id) return
    let active = true

    api<{ unreadNotifications: number; unreadChats: number; pendingRequests: number }>(
      '/api/user/badges',
    )
      .then((badges) => {
        if (active) patch(badges)
      })
      .catch(() => null)

    return () => {
      active = false
    }
  }, [user?.id, patch])

  const value = useMemo<SessionContextValue>(
    () => ({ user, isSignedIn: user !== null, refresh, patch }),
    [user, refresh, patch],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

/** Throws outside the provider - a missing provider is a bug, not a state. */
export function useSession(): SessionContextValue {
  const context = useContext(SessionContext)
  if (!context) {
    throw new Error('useSession must be used inside <SessionProvider>')
  }
  return context
}

/**
 * For components that only render inside authenticated routes. Middleware
 * guarantees a user, so this narrows the type instead of forcing null checks.
 */
export function useCurrentUser(): SessionUser {
  const { user } = useSession()
  if (!user) throw new Error('useCurrentUser used outside an authenticated route')
  return user
}
