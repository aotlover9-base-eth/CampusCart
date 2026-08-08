'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { api, ApiError } from '@/lib/client/fetcher'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { OtpInput } from '@/components/ui/otp-input'
import { ArrowLeftIcon, PhoneIcon } from '@/components/ui/icons'

/**
 * Two-step sign-in: enter a destination, then the code.
 *
 * Phone is the primary channel because the account is keyed on a verified
 * number. Email is offered as a convenience for returning users who linked one,
 * and cannot create an account on its own.
 */

type Channel = 'SMS' | 'EMAIL'
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
  phone?: string
}

const RESEND_SECONDS = 60

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Middleware puts the blocked destination here so sign-in returns the user
  // to wherever they were actually headed.
  const nextPath = searchParams.get('next')

  const [channel, setChannel] = useState<Channel>('SMS')
  const [step, setStep] = useState<Step>('destination')

  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')

  const [maskedDestination, setMaskedDestination] = useState('')
  const [devCode, setDevCode] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)

  // Countdown for the resend cooldown.
  useEffect(() => {
    if (secondsLeft <= 0) return
    const timer = window.setTimeout(() => setSecondsLeft((value) => value - 1), 1_000)
    return () => window.clearTimeout(timer)
  }, [secondsLeft])

  const destination = channel === 'SMS' ? phone : email

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
          channel,
          purpose: 'LOGIN',
          ...(channel === 'SMS' ? { phone } : { email }),
        },
      })

      setMaskedDestination(result.destination)
      setDevCode(result.devCode ?? null)
      setSecondsLeft(RESEND_SECONDS)
      setStep('code')
      setCode('')
    } catch (caught) {
      if (caught instanceof ApiError) {
        // A field-level message belongs under the input, not in the banner.
        const field = caught.fields?.phone ?? caught.fields?.email
        if (field) setFieldError(field)
        else setError(caught.message)
      } else {
        setError('Could not send the code. Check your connection.')
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
            channel,
            purpose: 'LOGIN',
            code: submittedCode,
            ...(channel === 'SMS' ? { phone } : { email }),
          },
        })

        if (result.next === 'needs_profile') {
          // Verified number with no account yet — continue into signup. The
          // number is passed along so onboarding doesn't ask for it twice.
          const params = new URLSearchParams({ phone: result.phone ?? phone })
          if (nextPath) params.set('next', nextPath)
          router.push(`/onboarding?${params.toString()}`)
          return
        }

        // Full navigation, not router.push: the session cookie was just set and
        // every cached server component needs to re-render against it.
        window.location.href = nextPath ?? '/home'
      } catch (caught) {
        setCode('')
        setError(
          caught instanceof ApiError ? caught.message : 'Could not verify that code.',
        )
        setSubmitting(false)
      }
    },
    [channel, phone, email, nextPath, router],
  )

  function changeChannel(next: Channel) {
    setChannel(next)
    setError(null)
    setFieldError(null)
  }

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
            <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-[var(--color-ink)]">
              Sign in
            </h1>
            <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--color-ink-muted)]">
              We'll text you a six-digit code. No password to remember.
            </p>

            <div
              role="tablist"
              aria-label="Sign-in method"
              className="mt-6 grid grid-cols-2 gap-1 rounded-[12px] bg-[var(--color-surface-sunken)] p-1"
            >
              <ChannelTab
                active={channel === 'SMS'}
                onClick={() => changeChannel('SMS')}
                label="Phone"
              />
              <ChannelTab
                active={channel === 'EMAIL'}
                onClick={() => changeChannel('EMAIL')}
                label="Email"
              />
            </div>

            <form onSubmit={requestCode} className="mt-5 space-y-4">
              {channel === 'SMS' ? (
                <Input
                  key="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  autoFocus
                  label="Mobile number"
                  prefix="+91"
                  placeholder="98765 43210"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  error={fieldError ?? undefined}
                  hint={!fieldError ? 'Indian mobile numbers only.' : undefined}
                />
              ) : (
                <Input
                  key="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  label="Email address"
                  placeholder="you@vitbhopal.ac.in"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  error={fieldError ?? undefined}
                  hint={
                    !fieldError
                      ? 'Only works if you already linked this address.'
                      : undefined
                  }
                />
              )}

              {error && <ErrorBanner message={error} />}

              <Button
                type="submit"
                size="lg"
                fullWidth
                loading={submitting}
                disabled={destination.trim().length === 0}
              >
                Send code
              </Button>
            </form>

            <p className="mt-5 text-center text-[13px] text-[var(--color-ink-muted)]">
              New here? Signing in with your phone creates your account.
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
              className={cn(
                'mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium',
                'text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]',
              )}
            >
              <ArrowLeftIcon className="h-3.5 w-3.5" />
              Change {channel === 'SMS' ? 'number' : 'email'}
            </button>

            <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-[var(--color-ink)]">
              Enter your code
            </h1>
            <p className="mt-1.5 flex items-center gap-1.5 text-[14px] text-[var(--color-ink-muted)]">
              <PhoneIcon className="h-4 w-4 shrink-0" />
              Sent to <span className="font-medium text-[var(--color-ink)]">{maskedDestination}</span>
            </p>

            <div className="mt-7">
              <OtpInput
                value={code}
                onChange={setCode}
                onComplete={verifyCode}
                disabled={submitting}
                error={error ?? undefined}
                autoFocus
              />
            </div>

            {devCode && (
              // Dev-mode convenience: the console driver has no real delivery.
              <p className="mt-4 rounded-[10px] border border-dashed border-[var(--color-line-strong)] px-3 py-2 text-center text-[13px] text-[var(--color-ink-muted)]">
                Dev code: <span className="font-mono font-semibold text-[var(--color-ink)]">{devCode}</span>
              </p>
            )}

            <Button
              className="mt-6"
              size="lg"
              fullWidth
              loading={submitting}
              disabled={code.length !== 6}
              onClick={() => verifyCode(code)}
            >
              Verify and continue
            </Button>

            <div className="mt-5 text-center text-[13px] text-[var(--color-ink-muted)]">
              {secondsLeft > 0 ? (
                <span>Resend available in {secondsLeft}s</span>
              ) : (
                <button
                  type="button"
                  onClick={() => void requestCode()}
                  disabled={submitting}
                  className="font-medium text-[var(--color-ink)] underline underline-offset-2 disabled:opacity-50"
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

function ChannelTab({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'relative h-9 rounded-[9px] text-[13px] font-medium transition-colors',
        active ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-muted)]',
      )}
    >
      {active && (
        <motion.span
          layoutId="channel-tab"
          transition={{ type: 'spring', stiffness: 500, damping: 38 }}
          className="absolute inset-0 rounded-[9px] bg-[var(--color-surface)] shadow-[var(--shadow-xs)]"
        />
      )}
      <span className="relative">{label}</span>
    </button>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className={cn(
        'rounded-[10px] border px-3 py-2.5 text-[13px] leading-snug',
        'border-[var(--color-danger)]/25 bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
      )}
    >
      {message}
    </p>
  )
}
