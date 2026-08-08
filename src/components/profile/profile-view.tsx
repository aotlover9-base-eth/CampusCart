'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { cn, timeAgo } from '@/lib/utils'
import { ROLE_LABELS, Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ListingFeed, type FeedFilters } from '@/components/listing/listing-feed'
import { ClockIcon, MapPinIcon, SettingsIcon } from '@/components/ui/icons'

/**
 * Public profile with the seller's listings.
 *
 * Two tabs: what they have for sale now, and what they have already sold. The
 * sold tab doubles as a trust signal — a seller with completed sales is a safer
 * bet than a brand-new account.
 */

interface ProfileUser {
  id: string
  fullName: string
  email: string | null
  role: string | null
  department: string | null
  year: number | null
  bio: string | null
  avatarUrl: string | null
  isVitVerified: boolean
  isOnline: boolean
  lastSeenAt: string
  listingCount: number
  soldCount: number
  joinedAt: string
  hostelBlock: string | null
}

type Tab = 'active' | 'sold'

export function ProfileView({
  user,
  isYou,
}: {
  user: ProfileUser
  isYou: boolean
  isSignedIn: boolean
}) {
  const [tab, setTab] = useState<Tab>('active')

  const filters = useMemo<FeedFilters>(
    () => ({
      sellerId: user.id,
      sort: 'newest',
      // The active tab shows everything still available; sold gets its own state.
      ...(tab === 'sold' ? { status: 'SOLD' } : {}),
    }),
    [user.id, tab],
  )

  return (
    <div className="mx-auto max-w-[var(--container-max)] px-4 py-5 sm:py-7">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <Avatar
          name={user.fullName}
          src={user.avatarUrl}
          size="xl"
          verified={user.isVitVerified}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--color-ink)]">
              {user.fullName}
            </h1>
            {user.isVitVerified && <Badge tone="accent">VIT verified</Badge>}
            {user.isOnline ? (
              <Badge tone="success">Online</Badge>
            ) : (
              <span className="flex items-center gap-1 text-[12px] text-[var(--color-ink-subtle)]">
                <ClockIcon className="h-3 w-3" />
                Active {timeAgo(user.lastSeenAt)}
              </span>
            )}
          </div>

          <p className="mt-1 text-[13.5px] text-[var(--color-ink-muted)]">
            {[
              user.role ? ROLE_LABELS[user.role] : null,
              user.department,
              user.year ? `Year ${user.year}` : null,
            ]
              .filter(Boolean)
              .join(' · ') || 'Member'}
          </p>

          {user.bio && (
            <p className="mt-2.5 max-w-[60ch] whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--color-ink)]">
              {user.bio}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-[var(--color-ink-subtle)]">
            <span>
              <strong className="font-semibold text-[var(--color-ink)]">
                {user.listingCount}
              </strong>{' '}
              listed
            </span>
            <span>
              <strong className="font-semibold text-[var(--color-ink)]">
                {user.soldCount}
              </strong>{' '}
              sold
            </span>
            {user.hostelBlock && (
              <span className="flex items-center gap-1">
                <MapPinIcon className="h-3.5 w-3.5" />
                {user.hostelBlock}
              </span>
            )}
            <span>Joined {timeAgo(user.joinedAt)}</span>
          </div>
        </div>

        {isYou && (
          <div className="flex shrink-0 gap-2">
            <Link href="/settings">
              <Button variant="secondary" size="sm">
                <SettingsIcon className="h-4 w-4" />
                Edit profile
              </Button>
            </Link>
          </div>
        )}
      </header>

      <div
        role="tablist"
        aria-label="Listings"
        className="mt-7 flex gap-1 border-b border-[var(--color-line)]"
      >
        <TabButton active={tab === 'active'} onClick={() => setTab('active')} label="Listings" />
        <TabButton active={tab === 'sold'} onClick={() => setTab('sold')} label="Sold" />
      </div>

      <div className="pt-5">
        <ListingFeed
          // Remount between tabs so the sold set never appends to the live one.
          key={tab}
          filters={filters}
          emptyTitle={
            tab === 'active'
              ? isYou
                ? 'You have nothing listed'
                : 'Nothing for sale right now'
              : 'Nothing sold yet'
          }
          emptyDescription={
            tab === 'active'
              ? isYou
                ? 'List your first item and it shows up here.'
                : 'Check back later.'
              : 'Completed sales will appear here.'
          }
          emptyAction={
            isYou && tab === 'active' ? (
              <Link href="/sell">
                <Button>Create a listing</Button>
              </Link>
            ) : undefined
          }
        />
      </div>
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
        'relative px-4 py-2.5 text-[14px] font-medium transition-colors',
        active
          ? 'text-[var(--color-ink)]'
          : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]',
      )}
    >
      {label}
      {active && (
        <motion.span
          layoutId="profile-tab"
          transition={{ type: 'spring', stiffness: 500, damping: 40 }}
          className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-[var(--color-ink)]"
        />
      )}
    </button>
  )
}
