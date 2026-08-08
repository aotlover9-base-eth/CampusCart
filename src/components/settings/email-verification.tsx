'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { api, ApiError } from '@/lib/client/fetcher'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { OtpInput } from '@/components/ui/otp-input'
import { useToast } from '@/components/ui/toast'
import { CheckIcon, ShieldIcon } from '@/components/ui/icons'

/**
 * Add and verify an email address after signing up by phone.
 *
 * Signup only requires a phone number, so a user who joined that way had no way
 * to attach an email — and therefore no way to earn the VIT badge. This puts the
 * whole flow in Settings: send a code, enter it, badge granted if the domain
 * matches.
 *
 * The badge requires a *verified* address, so the email is never trusted from
 * the input alone — /api/auth/email PUT is what sets it.
 */

const RESEND_SECONDS = 60

export function EmailVerification({
  currentEmail,
  isVerified,
  isVitVerified,
  vitDomain,
}: {
  currentEmail: string | null
  isVerified: boolean
  isVitVerified: boolean
  /** Shown so the user knows which domain earns the badge. */
  vitDomain: string
}) {
  const router = useRouter()
  const toast = useToast()

  const [step, setStep] = useState<'idle' | 'entering' | 'code'>('idle')
  const [email, setEmail] = useState(currentEmail ?? '')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [devCode, setDevCode] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)

  useEffect(() => {
    if (secondsLeft <= 0) return
    const timer = window.setTimeout(() => setSecondsLeft((value) => value - 1), 1_000)
    return () => window.clearTimeout(timer)
  }, [secondsLeft])

  async function sendCode() {
    const address = email.trim().toLowerCase()
    if (!address) return

    setBusy(true)
    setError(null)

    try {
      const result = await api<{ sent: boolean; devCode?: string }>('/api/auth/email', {
        method: 'POST',
        body: { email: address },
      })
      setDevCode(result.devCode ?? null)
      setSecondsLeft(RESEND_SECONDS)
      setCode('')
      setStep('code')
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? (caught.fields?.email ?? caught.message)
          : 'Could not send that code.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function confirmCode(submitted: string) {
    setBusy(true)
    setError(null)

    try {
      const result = await api<{ verified: boolean; isVitVerified: boolean }>(
        '/api/auth/email',
        { method: 'PUT', body: { email: email.trim().toLowerCase(), code: submitted } },
      )

      toast.success(
        result.isVitVerified
          ? 'Email verified — VIT badge granted'
          : 'Email verified',
      )
      setStep('idle')
      setDevCode(null)
      // Refresh so the badge and the row below both reflect the new state.
      router.refresh()
    } catch (caught) {
      setCode('')
      setError(caught instanceof ApiError ? caught.message : 'That code did not work.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-line)] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12.5px] text-[var(--color-ink-subtle)]">Email</p>
          <p className="mt-0.5 truncate text-[14px] text-[var(--color-ink)]">
            {currentEmail ?? 'Not linked'}
          </p>
        </div>

        {currentEmail ? (
          isVerified ? (
            <Badge tone="success">Verified</Badge>
          ) : (
            <Badge tone="warning">Unverified</Badge>
          )
        ) : null}
      </div>

      {isVitVerified ? (
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-[var(--color-success)]">
          <ShieldIcon className="h-3.5 w-3.5 shrink-0" />
          Your VIT badge is active.
        </p>
      ) : (
        <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
          Verify a <span className="font-medium">@{vitDomain}</span> address to earn the
          VIT badge. Any other domain verifies the address only.
        </p>
      )}

      <AnimatePresence mode="wait" initial={false}>
        {step === 'idle' && (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-3"
          >
            <Button size="sm" variant="secondary" onClick={() => setStep('entering')}>
              {currentEmail && isVerified
                ? 'Change email'
                : currentEmail
                  ? 'Verify this email'
                  : 'Add an email'}
            </Button>
          </motion.div>
        )}

        {step === 'entering' && (
          <motion.div
            key="entering"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="mt-3 space-y-2.5"
          >
            <Input
              type="email"
              label="Email address"
              placeholder={`you@${vitDomain}`}
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={error ?? undefined}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                loading={busy}
                disabled={!email.trim()}
                onClick={() => void sendCode()}
              >
                Send code
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setStep('idle')
                  setError(null)
                  setEmail(currentEmail ?? '')
                }}
              >
                Cancel
              </Button>
            </div>
          </motion.div>
        )}

        {step === 'code' && (
          <motion.div
            key="code"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="mt-3 space-y-3"
          >
            <p className="text-[12.5px] text-[var(--color-ink-muted)]">
              Code sent to <span className="font-medium text-[var(--color-ink)]">{email}</span>
            </p>

            <OtpInput
              value={code}
              onChange={setCode}
              onComplete={confirmCode}
              disabled={busy}
              error={error ?? undefined}
              autoFocus
            />

            {devCode && (
              <p
                className={cn(
                  'rounded-[10px] border border-dashed px-3 py-2 text-center text-[12.5px]',
                  'border-[var(--color-line-strong)] text-[var(--color-ink-muted)]',
                )}
              >
                Dev code:{' '}
                <span className="font-mono font-semibold text-[var(--color-ink)]">
                  {devCode}
                </span>
              </p>
            )}

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                loading={busy}
                disabled={code.length !== 6}
                onClick={() => void confirmCode(code)}
              >
                <CheckIcon className="h-3.5 w-3.5" />
                Verify
              </Button>

              {secondsLeft > 0 ? (
                <span className="text-[12px] text-[var(--color-ink-subtle)]">
                  Resend in {secondsLeft}s
                </span>
              ) : (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void sendCode()}>
                  Resend code
                </Button>
              )}

              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                className="ml-auto"
                onClick={() => {
                  setStep('idle')
                  setError(null)
                  setCode('')
                }}
              >
                Cancel
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
