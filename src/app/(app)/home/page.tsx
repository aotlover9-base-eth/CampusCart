import type { Metadata } from 'next'
import Link from 'next/link'
import { getSessionUser } from '@/lib/auth/session-user'
import { listCategories } from '@/lib/categories'
import { HomeFeed } from './home-feed'

export const metadata: Metadata = {
  title: 'Buy',
  description: 'Browse what VIT Bhopal students are selling right now.',
}

// The feed is per-user (saved and liked state), so it cannot be statically cached.
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  // Both are independent reads; run them together rather than in series.
  const [user, categories] = await Promise.all([getSessionUser(), listCategories()])

  const firstName = user?.fullName.split(' ')[0] ?? 'there'

  return (
    <div className="mx-auto max-w-[var(--container-max)] px-4 py-5 sm:py-7">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--color-ink)] sm:text-[26px]">
            Hey {firstName}
          </h1>
          <p className="mt-0.5 text-[13px] text-[var(--color-ink-muted)]">
            Fresh listings from your campus.
          </p>
        </div>

        <Link
          href="/sell"
          className="hidden h-9 items-center rounded-[10px] bg-[var(--color-ink)] px-4 text-sm font-medium text-[var(--color-ink-inverse)] transition-opacity hover:opacity-90 sm:inline-flex"
        >
          Sell something
        </Link>
      </header>

      <HomeFeed categories={categories} />
    </div>
  )
}
