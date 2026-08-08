'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { api, ApiError } from '@/lib/client/fetcher'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { OtpInput } from '@/components/ui/otp-input'
import { ArrowLeftIcon } from '@/components/ui/icons'

type Step = 'destination' | 'code'

interface RequestResult {
  sent: boolean
  destination: string
  expiresInSeconds: number
  devCode?: string
}

interface VerifyResult {
  verified: boolean
  next: 'signed_in' | 'needs_profile' | 'email_attached'
  email?: string
}

const RESEND_SECONDS = 60

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = searchParams.get('next')

  const [step, setStep] = useState<Step>('destination')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')

  const [maskedDestination, setMaskedDestination] = useState('')
  const [devCode, setDevCode] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)

  useEffect(() => {
    if (secondsLeft <= 0) return
    const timer = window.setTimeout(() => setSecondsLeft((value) => value - 1), 1_000)
    return () => window.clearTimeout(timer)
  }, [secondsLeft])

  async function requestCode(event?: React.FormEvent) {
    event?.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setError(null)
    setFieldError(null)

    try {
      const result = await api<RequestResult>('/api/auth/otp/request', {
        method: 'POST',
        body: {
          channel: 'EMAIL',
          purpose: 'LOGIN',
          email,
        },
      })

      setMaskedDestination(result.destination)
      setDevCode(result.devCode ?? null)
      setSecondsLeft(RESEND_SECONDS)
      setStep('code')
      setCode('')
    } catch (caught) {
      if (caught instanceof ApiError) {
        const field = caught.fields?.email
        if (field) setFieldError(field)
        else setError(caught.message)
      } else {
        setError('Could not send the verification code. Check your connection.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const verifyCode = useCallback(
    async (submittedCode: string) => {
      setSubmitting(true)
      setError(null)

      try {
        const result = await api<VerifyResult>('/api/auth/otp/verify', {
          method: 'POST',
          body: {
            channel: 'EMAIL',
            purpose: 'LOGIN',
            code: submittedCode,
            email,
          },
        })

        if (result.next === 'needs_profile') {
          const params = new URLSearchParams({ email: result.email ?? email })
          if (nextPath) params.set('next', nextPath)
          router.push(`/onboarding?${params.toString()}`)
          return
        }

        window.location.href = nextPath ?? '/home'
      } catch (caught) {
        setCode('')
        setError(
          caught instanceof ApiError ? caught.message : 'Could not verify that code.',
        )
        setSubmitting(false)
      }
    },
    [email, nextPath, router],
  )

  function goBack() {
    setStep('destination')
    setCode('')
    setError(null)
  }

  return (
    <div>
      <AnimatePresence mode="wait" initial={false}>
        {step === 'destination' ? (
          <motion.div
            key="destination"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <h1 className="text-[28px] font-bold tracking-tight text-[var(--color-ink)]">
              Sign in with Email
            </h1>
            <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--color-ink-muted)]">
              Enter your email to receive a 6-digit code. Official VIT Bhopal emails (<span className="font-mono text-emerald-500">@vitbhopal.ac.in</span>) automatically receive the Verified Student Badge.
            </p>

            <form onSubmit={requestCode} className="mt-6 space-y-4">
              <Input
                key="email"
                type="email"
                autoComplete="email"
                autoFocus
                label="Email address"
                placeholder="you@vitbhopal.ac.in or personal email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                error={fieldError ?? undefined}
                hint={
                  !fieldError
                    ? 'We will send a 6-digit single-use code.'
                    : undefined
                }
              />

              {error && <ErrorBanner message={error} />}

              <Button
                type="submit"
                size="lg"
                fullWidth
                loading={submitting}
                disabled={email.trim().length === 0}
              >
                Send verification code
              </Button>
            </form>

            <p className="mt-6 text-center text-[13px] text-[var(--color-ink-subtle)]">
              Signing in with a new email address automatically creates your account.
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="code"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <button
              type="button"
              onClick={goBack}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            >
              <ArrowLeftIcon className="h-4 w-4" /> Change email
            </button>

            <h1 className="mt-3 text-[26px] font-semibold tracking-tight text-[var(--color-ink)]">
              Check your inbox
            </h1>
            <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--color-ink-muted)]">
              We sent a 6-digit code to{' '}
              <strong className="font-semibold text-[var(--color-ink)]">
                {maskedDestination || email}
              </strong>.
            </p>

            {devCode && (
              <div className="mt-4 rounded-[12px] border border-amber-500/30 bg-amber-500/10 p-3.5 text-center text-[13px]">
                <p className="font-semibold text-amber-500">Console Mode active</p>
                <p className="mt-1 font-mono text-[16px] tracking-wider text-[var(--color-ink)]">
                  Code: {devCode}
                </p>
              </div>
            )}

            <div className="mt-6">
              <OtpInput
                length={6}
                value={code}
                onChange={setCode}
                onComplete={verifyCode}
                disabled={submitting}
                autoFocus
              />
            </div>

            {error && <ErrorBanner message={error} className="mt-4" />}

            <div className="mt-6 flex items-center justify-between text-[13px]">
              <span className="text-[var(--color-ink-subtle)]">Didn&apos;t get it?</span>
              {secondsLeft > 0 ? (
                <span className="font-mono text-[var(--color-ink-muted)]">
                  Resend in {secondsLeft}s
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => void requestCode()}
                  disabled={submitting}
                  className="font-medium text-[var(--color-accent)] hover:underline"
                >
                  Resend code
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ErrorBanner({ message, className }: { message: string; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-[10px] bg-[var(--color-danger-soft)] p-3 text-[13px] font-medium text-[var(--color-danger)]',
        className,
      )}
    >
      {message}
    </div>
  )
}
