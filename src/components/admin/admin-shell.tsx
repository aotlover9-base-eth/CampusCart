'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { api } from '@/lib/client/fetcher'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import {
  ChartIcon,
  FlagIcon,
  GridIcon,
  LockIcon,
  SettingsIcon,
  TagIcon,
  UsersIcon,
} from '@/components/ui/icons'

/**
 * Admin chrome: a fixed sidebar on desktop, a scrolling tab strip on mobile.
 *
 * Every link is built from `basePath`, which the server passes down from env -
 * the panel's location is never hardcoded in client code.
 */

const SECTIONS = [
  { slug: 'dashboard', label: 'Overview', Icon: ChartIcon },
  { slug: 'users', label: 'Users', Icon: UsersIcon },
  { slug: 'listings', label: 'Listings', Icon: GridIcon },
  { slug: 'reports', label: 'Reports', Icon: FlagIcon },
  { slug: 'categories', label: 'Categories', Icon: TagIcon },
  { slug: 'logs', label: 'Audit log', Icon: LockIcon },
  { slug: 'settings', label: 'Settings', Icon: SettingsIcon },
] as const

export function AdminShell({
  admin,
  basePath,
  children,
}: {
  admin: { username: string; role: string }
  basePath: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  async function signOut() {
    setSigningOut(true)
    try {
      await api('/api/admin/logout', { method: 'POST' })
    } finally {
      router.replace(`${basePath}/login`)
    }
  }

  const active = (slug: string) => pathname.startsWith(`${basePath}/${slug}`)

  return (
    <div className="min-h-dvh bg-[var(--color-canvas)] lg:grid lg:grid-cols-[228px_minmax(0,1fr)]">
      <aside className="hidden border-r border-[var(--color-line)] bg-[var(--color-surface)] lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] bg-[var(--color-ink)] text-[11px] font-bold text-[var(--color-canvas)]">
            CC
          </span>
          <span className="text-[13.5px] font-semibold tracking-[-0.01em] text-[var(--color-ink)]">
            Admin
          </span>
        </div>

        <nav className="flex-1 space-y-0.5 px-2 py-2">
          {SECTIONS.map(({ slug, label, Icon }) => (
            <Link
              key={slug}
              href={`${basePath}/${slug}`}
              className={cn(
                'relative flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13.5px] transition-colors',
                active(slug)
                  ? 'font-medium text-[var(--color-ink)]'
                  : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)]',
              )}
            >
              {active(slug) && (
                <motion.span
                  layoutId="admin-nav"
                  transition={{ type: 'spring', stiffness: 480, damping: 38 }}
                  className="absolute inset-0 -z-10 rounded-[var(--radius-sm)] bg-[var(--color-surface-sunken)]"
                />
              )}
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-[var(--color-line)] p-3">
          <div className="mb-2.5 min-w-0">
            <p className="truncate text-[13px] font-medium text-[var(--color-ink)]">
              {admin.username}
            </p>
            <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-subtle)]">
              {admin.role.replace(/_/g, ' ').toLowerCase()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              fullWidth
              loading={signingOut}
              onClick={() => void signOut()}
            >
              Sign out
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-10 flex items-center gap-2 overflow-x-auto border-b border-[var(--color-line)] bg-[var(--color-surface)]/90 px-3 py-2 backdrop-blur-xl lg:hidden">
          {SECTIONS.map(({ slug, label }) => (
            <Link
              key={slug}
              href={`${basePath}/${slug}`}
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-[13px] transition-colors',
                active(slug)
                  ? 'bg-[var(--color-ink)] font-medium text-[var(--color-canvas)]'
                  : 'text-[var(--color-ink-muted)]',
              )}
            >
              {label}
            </Link>
          ))}
          <div className="ml-auto flex shrink-0 items-center gap-1.5 pl-2">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              Exit
            </Button>
          </div>
        </header>

        <main className="px-4 py-5 sm:px-6 sm:py-7">{children}</main>
      </div>
    </div>
  )
}
