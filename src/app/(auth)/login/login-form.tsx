'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { api, ApiError } from '@/lib/client/fetcher'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { OtpInput } from '@/components/ui/otp-input'
import { ArrowLeftIcon } from '@/components/ui/icons'

type Mode = 'SIGNIN' | 'SIGNUP'
type Step = 'form' | 'code'

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



interface LoginResult {
  signedIn: boolean
  user: { id: string; fullName: string; role: string }
}

const RESEND_SECONDS = 60

export function LoginForm() {
  const searchParams = useSearchParams()
  const nextPath = searchParams.get('next')

  const [mode, setMode] = useState<Mode>('SIGNIN')
  const [step, setStep] = useState<Step>('form')

  // Sign In fields
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  // Sign Up fields
  const [fullName, setFullName] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [code, setCode] = useState('')
  const [maskedDestination, setMaskedDestination] = useState('')
  const [devCode, setDevCode] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)

  // Password rules validation
  const hasMinLength = createPassword.length >= 8
  const hasUppercase = /[A-Z]/.test(createPassword)
  const hasLowercase = /[a-z]/.test(createPassword)
  const hasNumber = /[0-9]/.test(createPassword)
  const hasSymbol = /[^a-zA-Z0-9]/.test(createPassword)
  const passwordsMatch = createPassword.length > 0 && createPassword === confirmPassword

  const isPasswordValid = hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSymbol
  const isSignupFormValid =
    fullName.trim().length >= 2 &&
    signupEmail.trim().length > 0 &&
    isPasswordValid &&
    passwordsMatch

  // Countdown for the resend cooldown.
  useEffect(() => {
    if (secondsLeft <= 0) return
    const timer = window.setTimeout(() => setSecondsLeft((value) => value - 1), 1_000)
    return () => window.clearTimeout(timer)
  }, [secondsLeft])

  async function handlePasswordLogin(event: React.FormEvent) {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setError(null)
    setFieldError(null)

    try {
      await api<LoginResult>('/api/auth/login', {
        method: 'POST',
        body: { email: loginEmail.trim(), password: loginPassword },
      })

      window.location.href = nextPath ?? '/home'
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message)
      } else {
        setError('Could not sign in. Check your credentials and connection.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSignupRequestOtp(event: React.FormEvent) {
    event.preventDefault()
    if (!isSignupFormValid || submitting) return

    setSubmitting(true)
    setError(null)
    setFieldError(null)

    try {
      const result = await api<RequestResult>('/api/auth/otp/request', {
        method: 'POST',
        body: {
          channel: 'EMAIL',
          email: signupEmail.trim(),
          purpose: 'SIGNUP',
        },
      })

      setMaskedDestination(result.destination)
      setDevCode(result.devCode ?? null)
      setSecondsLeft(RESEND_SECONDS)
      setStep('code')
      setCode('')
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message)
      } else {
        setError('Could not send the verification code.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const verifyCodeAndRegister = useCallback(
    async (submittedCode: string) => {
      setSubmitting(true)
      setError(null)

      try {
        const verifyRes = await api<VerifyResult>('/api/auth/otp/verify', {
          method: 'POST',
          body: {
            channel: 'EMAIL',
            email: signupEmail.trim(),
            purpose: 'SIGNUP',
            code: submittedCode,
          },
        })

        if (verifyRes.next === 'needs_profile') {
          const params = new URLSearchParams({
            email: signupEmail.trim(),
            fullName: fullName.trim(),
            password: createPassword,
          })
          if (nextPath) params.set('next', nextPath)
          window.location.href = `/onboarding?${params.toString()}`
          return
        }

        window.location.href = nextPath ?? '/home'
      } catch (caught) {
        setCode('')
        setError(
          caught instanceof ApiError ? caught.message : 'Could not verify code and create account.',
        )
        setSubmitting(false)
      }
    },
    [signupEmail, createPassword, fullName, nextPath],
  )

  function changeMode(next: Mode) {
    setMode(next)
    setStep('form')
    setError(null)
    setFieldError(null)
  }

  function goBack() {
    setStep('form')
    setCode('')
    setError(null)
  }

  return (
    <div>
      <AnimatePresence mode="wait" initial={false}>
        {step === 'form' ? (
          <motion.div
            key="form"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-[var(--color-ink)]">
              {mode === 'SIGNIN' ? 'Sign in to CampusCart' : 'Create your account'}
            </h1>
            <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--color-ink-muted)]">
              {mode === 'SIGNIN'
                ? 'Enter your email and password to sign in.'
                : 'Enter your details and set a password to sign up.'}
            </p>

            <div
              role="tablist"
              aria-label="Sign-in or Sign-up"
              className="mt-6 grid grid-cols-2 gap-1 rounded-[12px] bg-[var(--color-surface-sunken)] p-1"
            >
              <TabButton
                active={mode === 'SIGNIN'}
                onClick={() => changeMode('SIGNIN')}
                label="Sign In"
              />
              <TabButton
                active={mode === 'SIGNUP'}
                onClick={() => changeMode('SIGNUP')}
                label="Sign Up"
              />
            </div>

            {mode === 'SIGNIN' ? (
              <form onSubmit={handlePasswordLogin} className="mt-5 space-y-4">
                <Input
                  key="login-email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  label="Email address"
                  placeholder="you@vitbhopal.ac.in"
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                  error={fieldError ?? undefined}
                />

                <Input
                  key="login-password"
                  type="password"
                  autoComplete="current-password"
                  label="Password"
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                />

                {error && <ErrorBanner message={error} />}

                <Button
                  type="submit"
                  size="lg"
                  fullWidth
                  loading={submitting}
                  disabled={!loginEmail.trim() || !loginPassword}
                >
                  Sign In
                </Button>

                <p className="mt-3 text-center text-[13px] text-[var(--color-ink-muted)]">
                  Don't have an account?{' '}
                  <button
                    type="button"
                    onClick={() => changeMode('SIGNUP')}
                    className="font-medium text-[var(--color-ink)] underline underline-offset-2"
                  >
                    Sign Up
                  </button>
                </p>
              </form>
            ) : (
              <form onSubmit={handleSignupRequestOtp} className="mt-5 space-y-4">
                <Input
                  key="signup-name"
                  type="text"
                  autoComplete="name"
                  autoFocus
                  label="Full name"
                  placeholder="Aarav Sharma"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                />

                <Input
                  key="signup-email"
                  type="email"
                  autoComplete="email"
                  label="Email address"
                  placeholder="you@vitbhopal.ac.in"
                  value={signupEmail}
                  onChange={(event) => setSignupEmail(event.target.value)}
                  hint="We will send a 6-digit OTP code to verify your email."
                />

                <Input
                  key="create-password"
                  type="password"
                  autoComplete="new-password"
                  label="Create Password"
                  placeholder="Create a strong password"
                  value={createPassword}
                  onChange={(event) => setCreatePassword(event.target.value)}
                />

                <Input
                  key="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  label="Confirm Password"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  error={
                    confirmPassword.length > 0 && !passwordsMatch
                      ? 'Passwords do not match'
                      : undefined
                  }
                />

                <div className="rounded-[10px] bg-[var(--color-surface-sunken)] p-3 text-[12px] space-y-1">
                  <p className="font-medium text-[var(--color-ink)] mb-1">Password Requirements:</p>
                  <RuleItem met={hasMinLength} text="At least 8 characters long" />
                  <RuleItem met={hasUppercase} text="At least 1 Capital letter (A-Z)" />
                  <RuleItem met={hasLowercase} text="At least 1 Small letter (a-z)" />
                  <RuleItem met={hasNumber} text="At least 1 Number (0-9)" />
                  <RuleItem met={hasSymbol} text="At least 1 Special symbol (@, #, $, !, %, etc.)" />
                  <RuleItem met={passwordsMatch} text="Passwords match" />
                </div>

                {error && <ErrorBanner message={error} />}

                <Button
                  type="submit"
                  size="lg"
                  fullWidth
                  loading={submitting}
                  disabled={!isSignupFormValid}
                >
                  Send OTP Code
                </Button>

                <p className="mt-3 text-center text-[13px] text-[var(--color-ink-muted)]">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => changeMode('SIGNIN')}
                    className="font-medium text-[var(--color-ink)] underline underline-offset-2"
                  >
                    Sign In
                  </button>
                </p>
              </form>
            )}
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
              Back to form
            </button>

            <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-[var(--color-ink)]">
              Verify your email
            </h1>
            <p className="mt-1.5 text-[14px] text-[var(--color-ink-muted)]">
              Sent 6-digit verification code to <span className="font-medium text-[var(--color-ink)]">{maskedDestination}</span>
            </p>

            <div className="mt-7">
              <OtpInput
                value={code}
                onChange={setCode}
                onComplete={verifyCodeAndRegister}
                disabled={submitting}
                error={error ?? undefined}
                autoFocus
              />
            </div>

            {devCode && (
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
              onClick={() => verifyCodeAndRegister(code)}
            >
              Verify and Create Account
            </Button>

            <div className="mt-5 text-center text-[13px] text-[var(--color-ink-muted)]">
              {secondsLeft > 0 ? (
                <span>Resend available in {secondsLeft}s</span>
              ) : (
                <button
                  type="button"
                  onClick={(e) => void handleSignupRequestOtp(e)}
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

function RuleItem({ met, text }: { met: boolean; text: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('text-[11px] font-bold', met ? 'text-[var(--color-success)]' : 'text-[var(--color-ink-subtle)]')}>
        {met ? '✓' : '•'}
      </span>
      <span className={met ? 'text-[var(--color-ink)] font-medium' : 'text-[var(--color-ink-muted)]'}>
        {text}
      </span>
    </div>
  )
}

function TabButton({
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
          layoutId="mode-tab"
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
