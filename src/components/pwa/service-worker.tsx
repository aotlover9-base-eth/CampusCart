'use client'

import { useEffect } from 'react'
import { isProduction } from '@/lib/env'

/**
 * Registers the service worker in production only.
 *
 * In development a service worker intercepts requests and shadows hot reloads,
 * which produces confusing stale-content bugs, so it is skipped there.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!isProduction) return
    if (!('serviceWorker' in navigator)) return

    // Registering after load keeps the worker off the critical path.
    const register = () => {
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        // A failed registration only costs offline support - never block the app.
      })
    }

    if (document.readyState === 'complete') {
      register()
    } else {
      window.addEventListener('load', register, { once: true })
      return () => window.removeEventListener('load', register)
    }
  }, [])

  return null
}
