import type { ReactNode } from 'react'
import Link from 'next/link'
import { LogoLockup } from '@/components/brand/logo'
import { ThemeToggle } from '@/components/theme/theme-toggle'

/**
 * Reading layout for the legal pages.
 *
 * A single measured column — these are documents, not app screens, so the
 * chrome stays out of the way and the line length stays readable.
 */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-[var(--color-line)]">
        <div className="mx-auto flex h-[var(--nav-height)] max-w-[var(--container-max)] items-center justify-between px-5">
          <Link href="/" aria-label="CampusCart home">
            <LogoLockup />
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-[68ch] px-5 py-10 sm:py-14">{children}</main>

      <footer className="border-t border-[var(--color-line)]">
        <div className="mx-auto flex max-w-[68ch] flex-wrap items-center gap-x-5 gap-y-2 px-5 py-6 text-[12.5px] text-[var(--color-ink-subtle)]">
          <Link href="/legal/terms" className="hover:text-[var(--color-ink)]">
            Terms
          </Link>
          <Link href="/legal/privacy" className="hover:text-[var(--color-ink)]">
            Privacy
          </Link>
          <span className="ml-auto">
            Built for VIT Bhopal. Not affiliated with the university administration.
          </span>
        </div>
      </footer>
    </div>
  )
}
