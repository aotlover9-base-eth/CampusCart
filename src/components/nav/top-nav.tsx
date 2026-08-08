'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { api } from '@/lib/client/fetcher'
import { useSession } from '@/components/providers/session-provider'
import { useTheme } from '@/components/theme/theme-provider'
import { LogoLockup } from '@/components/brand/logo'
import { Avatar } from '@/components/ui/avatar'
import { CountBadge } from '@/components/ui/badge'
import {
  BellIcon,
  BookmarkIcon,
  ChatIcon,
  HandshakeIcon,
  HomeIcon,
  LogoutIcon,
  MoonIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
  TagIcon,
  UserIcon,
} from '@/components/ui/icons'

/**
 * Primary navigation.
 *
 * Desktop: a single sticky top bar — Buy, Sell, Chats, Offers & requests, and
 * the profile menu.
 * Mobile: a compact top bar for brand and search, plus a bottom tab bar, which
 * is where thumbs actually reach.
 *
 * Offers and requests earn a top-level slot because they are decisions someone
 * is waiting on, and burying them in a dropdown meant sellers missed them.
 * Saved, notifications, and settings stay in the profile menu.
 */

const PRIMARY_LINKS = [
  { href: '/home', label: 'Buy', icon: TagIcon, match: ['/home', '/browse', '/search'] },
  { href: '/sell', label: 'Sell', icon: PlusIcon, match: ['/sell'] },
  { href: '/chats', label: 'Chats', icon: ChatIcon, match: ['/chats'] },
  { href: '/requests', label: 'Offers & requests', icon: HandshakeIcon, match: ['/requests'] },
]

export function TopNav() {
  const pathname = usePathname()
  const { user, isSignedIn } = useSession()

  const isActive = (matches: string[]) =>
    matches.some((path) => pathname === path || pathname.startsWith(`${path}/`))

  return (
    <header
      className={cn(
        'glass sticky top-0 z-[var(--z-nav)] border-b border-[var(--color-line)]',
        'pt-safe',
      )}
    >
      <nav
        aria-label="Primary"
        className="mx-auto flex h-[var(--nav-height)] max-w-[var(--container-max)] items-center gap-2 px-4"
      >
        <Link
          href={isSignedIn ? '/home' : '/'}
          className="shrink-0 rounded-[var(--radius-xs)] text-[var(--color-ink)]"
          aria-label="CampusCart home"
        >
          <LogoLockup />
        </Link>

        {/* Desktop primary links */}
        <div className="ml-4 hidden items-center gap-1 md:flex">
          {PRIMARY_LINKS.map((link) => (
            <NavLink
              key={link.href}
              href={link.href}
              label={link.label}
              active={isActive(link.match)}
              badge={
                link.href === '/chats'
                  ? user?.unreadChats
                  : link.href === '/requests'
                    ? user?.pendingRequests
                    : undefined
              }
            />
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Link
            href="/search"
            aria-label="Search"
            className={cn(
              'grid h-9 w-9 place-items-center rounded-[10px] text-[var(--color-ink-muted)]',
              'transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)]',
            )}
          >
            <SearchIcon className="h-[18px] w-[18px]" />
          </Link>

          {isSignedIn ? (
            <>
              <Link
                href="/notifications"
                aria-label={
                  user?.unreadNotifications
                    ? `Notifications, ${user.unreadNotifications} unread`
                    : 'Notifications'
                }
                className={cn(
                  'relative grid h-9 w-9 place-items-center rounded-[10px] text-[var(--color-ink-muted)]',
                  'transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)]',
                )}
              >
                <BellIcon className="h-[18px] w-[18px]" />
                {Boolean(user?.unreadNotifications) && (
                  <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[var(--color-danger)] ring-2 ring-[var(--color-surface)]" />
                )}
              </Link>

              <ProfileMenu />
            </>
          ) : (
            <Link
              href="/login"
              className={cn(
                'ml-1 inline-flex h-9 items-center rounded-[10px] px-4 text-sm font-medium',
                'bg-[var(--color-ink)] text-[var(--color-ink-inverse)] transition-opacity hover:opacity-90',
              )}
            >
              Sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  )
}

function NavLink({
  href,
  label,
  active,
  badge,
}: {
  href: string
  label: string
  active: boolean
  badge?: number
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex h-9 items-center gap-2 rounded-[10px] px-3.5 text-sm font-medium transition-colors',
        active
          ? 'text-[var(--color-ink)]'
          : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)]',
      )}
    >
      {label}
      {Boolean(badge) && <CountBadge count={badge ?? 0} />}
      {active && (
        // layoutId gives the indicator a shared-element slide between tabs.
        <motion.span
          layoutId="nav-active"
          transition={{ type: 'spring', stiffness: 500, damping: 40 }}
          className="absolute inset-x-2 -bottom-[11px] h-[2px] rounded-full bg-[var(--color-ink)]"
        />
      )}
    </Link>
  )
}

function ProfileMenu() {
  const { user } = useSession()
  const { resolved, toggle } = useTheme()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (!user) return null

  async function signOut() {
    try {
      await api('/api/auth/logout', { method: 'POST' })
    } catch {
      // Signing out locally matters more than the server acknowledging it.
    }
    // Full reload clears every cached server component tied to the old session.
    window.location.href = '/'
  }

  const items = [
    { href: `/u/${user.id}`, label: 'My profile', icon: UserIcon },
    { href: '/saved', label: 'Saved', icon: BookmarkIcon },
    { href: '/settings', label: 'Settings', icon: SettingsIcon },
  ]

  return (
    <div ref={containerRef} className="relative ml-0.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="grid h-9 w-9 place-items-center rounded-full transition-transform active:scale-95"
      >
        <Avatar
          name={user.fullName}
          src={user.avatarUrl}
          size="sm"
          verified={user.isVitVerified}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'absolute right-0 top-[calc(100%+8px)] w-60 overflow-hidden rounded-[var(--radius-md)]',
              'border border-[var(--color-line)] bg-[var(--color-surface-raised)] shadow-[var(--shadow-lg)]',
            )}
          >
            <div className="border-b border-[var(--color-line)] px-3.5 py-3">
              <p className="truncate text-sm font-semibold text-[var(--color-ink)]">
                {user.fullName}
              </p>
              <p className="truncate text-[12px] text-[var(--color-ink-muted)]">
                {user.email ?? user.phone}
              </p>
            </div>

            <div className="p-1">
              {items.map((item) => (
                <button
                  key={item.href}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false)
                    router.push(item.href)
                  }}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[13px]',
                    'text-[var(--color-ink)] transition-colors hover:bg-[var(--color-surface-hover)]',
                  )}
                >
                  <item.icon className="h-4 w-4 text-[var(--color-ink-muted)]" />
                  {item.label}
                </button>
              ))}

              <button
                type="button"
                role="menuitem"
                onClick={toggle}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[13px]',
                  'text-[var(--color-ink)] transition-colors hover:bg-[var(--color-surface-hover)]',
                )}
              >
                {resolved === 'dark' ? (
                  <SunIcon className="h-4 w-4 text-[var(--color-ink-muted)]" />
                ) : (
                  <MoonIcon className="h-4 w-4 text-[var(--color-ink-muted)]" />
                )}
                {resolved === 'dark' ? 'Light mode' : 'Dark mode'}
              </button>
            </div>

            <div className="border-t border-[var(--color-line)] p-1">
              <button
                type="button"
                role="menuitem"
                onClick={() => void signOut()}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[13px]',
                  'text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger-soft)]',
                )}
              >
                <LogoutIcon className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Bottom tab bar. Mobile only; the desktop bar covers the same destinations. */
export function MobileTabBar() {
  const pathname = usePathname()
  const { user, isSignedIn } = useSession()

  if (!isSignedIn) return null

  // Search is dropped from the tab bar because it already has a permanent slot
  // in the top bar; Offers does not, and it carries decisions someone is waiting
  // on, so it takes the seat.
  const tabs = [
    { href: '/home', label: 'Buy', icon: HomeIcon, match: ['/home', '/browse'] },
    {
      href: '/chats',
      label: 'Chats',
      icon: ChatIcon,
      match: ['/chats'],
      badge: user?.unreadChats,
    },
    { href: '/sell', label: 'Sell', icon: PlusIcon, match: ['/sell'], emphasis: true },
    {
      href: '/requests',
      label: 'Offers',
      icon: HandshakeIcon,
      match: ['/requests'],
      badge: user?.pendingRequests,
    },
    { href: `/u/${user?.id}`, label: 'You', icon: UserIcon, match: ['/u', '/settings'] },
  ]

  return (
    <nav
      aria-label="Primary"
      className={cn(
        'glass fixed inset-x-0 bottom-0 z-[var(--z-nav)] border-t border-[var(--color-line)]',
        'flex items-stretch pb-safe md:hidden',
      )}
    >
      {tabs.map((tab) => {
        const active = tab.match.some(
          (path) => pathname === path || pathname.startsWith(`${path}/`),
        )

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex flex-1 flex-col items-center justify-center gap-1',
              'h-[var(--nav-height-mobile)] text-[10px] font-medium transition-colors',
              active ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-subtle)]',
            )}
          >
            <span className="relative">
              {tab.emphasis ? (
                <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--color-ink)] text-[var(--color-ink-inverse)]">
                  <tab.icon className="h-4 w-4" />
                </span>
              ) : (
                <tab.icon className="h-[22px] w-[22px]" />
              )}

              {Boolean(tab.badge) && (
                <span className="absolute -right-1.5 -top-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[9px] font-semibold text-white">
                  {(tab.badge ?? 0) > 9 ? '9+' : tab.badge}
                </span>
              )}
            </span>
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
