'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { api, ApiError } from '@/lib/client/fetcher'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LockIcon } from '@/components/ui/icons'

/**
 * Admin sign-in form.
 *
 * Intentionally spare - no branding, no product name, no "forgot password", no
 * hint about what lives behind it. The panel's base path is read from the
 * current URL so nothing here has to know the configured value.
 */
export function AdminLoginForm() {
  const router = useRouter()
  const pathname = usePathname()
  const base = pathname.replace(/\/login\/?$/, '')

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setError(null)

    try {
      await api('/api/admin/login', {
        method: 'POST',
        body: { username: username.trim(), password },
      })
      // Full navigation, so middleware re-runs and sees the new cookie.
      router.replace(`${base}/dashboard`)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not sign in.')
      setPassword('')
      setSubmitting(false)
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--color-canvas)] px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-[340px]"
      >
        <div className="mb-7 flex flex-col items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-muted)]">
            <LockIcon className="h-5 w-5" />
          </span>
          <h1 className="text-[15px] font-medium text-[var(--color-ink)]">
            Restricted access
          </h1>
        </div>

        <form onSubmit={submit} className="space-y-3.5" noValidate>
          <Input
            label="Username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            autoFocus
          />

          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />

          {error && (
            <p role="alert" className="text-[12.5px] text-[var(--color-danger)]">
              {error}
            </p>
          )}

          <Button
            type="submit"
            fullWidth
            size="lg"
            loading={submitting}
            disabled={!username.trim() || !password}
          >
            Sign in
          </Button>
        </form>
      </motion.div>
    </main>
  )
}
