'use client'

import { useEffect, useState } from 'react'
import { LogoLockup } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'

/**
 * Offline screen.
 *
 * Watches the `online` event so the retry button becomes meaningful the moment
 * connectivity returns, rather than leaving the user to guess.
 */
export function OfflineNotice() {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    setOnline(navigator.onLine)

    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-[340px] text-center">
        <div className="mb-6 flex justify-center">
          <LogoLockup />
        </div>

        <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--color-ink)]">
          {online ? 'Back online' : 'No connection'}
        </h1>

        <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-ink-muted)]">
          {online
            ? 'Your connection is back. Reload to pick up where you left off.'
            : 'CampusCart needs a connection to load listings and messages. Anything you already had open still works.'}
        </p>

        <Button
          className="mt-6"
          size="lg"
          fullWidth
          variant={online ? 'primary' : 'secondary'}
          onClick={() => window.location.reload()}
        >
          {online ? 'Reload' : 'Try again'}
        </Button>
      </div>
    </main>
  )
}
