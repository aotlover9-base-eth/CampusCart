import type { ReactNode } from 'react'
import Link from 'next/link'
import { LogoLockup } from '@/components/brand/logo'
import { AuthIllustration } from '@/components/brand/illustrations'
import { ThemeToggle } from '@/components/theme/theme-toggle'

/**
 * Auth shell.
 *
 * Two panes on large screens — form on the left, artwork on the right. The
 * artwork pane is decorative, so it is hidden from assistive tech and dropped
 * entirely on small screens where vertical space belongs to the form.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1fr_1.05fr]">
      <div className="relative flex min-h-dvh flex-col px-6 py-7 sm:px-10 lg:px-14">
        <header className="flex items-center justify-between">
          <Link href="/" aria-label="CampusCart home" className="rounded-[10px]">
            <LogoLockup />
          </Link>
          <ThemeToggle />
        </header>

        <main className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[400px]">{children}</div>
        </main>

        <footer className="text-[12.5px] text-[var(--color-ink-subtle)]">
          For VIT Bhopal students only. By continuing you agree to our{' '}
          <Link href="/legal/terms" className="underline underline-offset-2 hover:text-[var(--color-ink)]">
            terms
          </Link>{' '}
          and{' '}
          <Link href="/legal/privacy" className="underline underline-offset-2 hover:text-[var(--color-ink)]">
            privacy policy
          </Link>
          .
        </footer>
      </div>

      <div
        aria-hidden
        className="relative hidden overflow-hidden bg-[var(--color-surface-sunken)] lg:block"
      >
        <div className="absolute inset-0 flex items-center justify-center p-16">
          <AuthIllustration className="h-auto w-full max-w-[520px]" />
        </div>
        <div className="absolute inset-x-0 bottom-0 p-14">
          <p className="max-w-[420px] text-[26px] font-semibold leading-[1.25] tracking-[-0.02em] text-[var(--color-ink)]">
            Buy and sell inside campus.
          </p>
          <p className="mt-2 max-w-[420px] text-[15px] leading-relaxed text-[var(--color-ink-muted)]">
            Textbooks, cycles, hostel gear, and everything else your batch is
            done with. No strangers, no shipping.
          </p>
        </div>
      </div>
    </div>
  )
}
