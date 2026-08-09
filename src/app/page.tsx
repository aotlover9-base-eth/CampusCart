import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/session-user'
import { db } from '@/lib/db'
import { LogoLockup } from '@/components/brand/logo'
import { AuthIllustration } from '@/components/brand/illustrations'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { CategoryIcon } from '@/components/brand/icons'
import { listCategories } from '@/lib/categories'

export const metadata: Metadata = {
  title: 'CampusCart - The VIT Bhopal Student Marketplace',
  description:
    'Buy and sell across VIT Bhopal. Electronics, books, cycles, furniture, services - everything students need.',
}

export const revalidate = 300

/**
 * Public landing page.
 *
 * Signed-in users never see this - middleware redirects them, and this
 * re-checks so a stale cookie cannot land someone on the marketing page.
 */
export default async function LandingPage() {
  const user = await getSessionUser()
  if (user) redirect('/home')

  const [categories, stats] = await Promise.all([
    listCategories(),
    loadPublicStats(),
  ])

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-[var(--nav-height)] max-w-[var(--container-max)] items-center justify-between px-5 pt-safe">
        <LogoLockup />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/login"
            className="inline-flex h-9 items-center rounded-[10px] bg-[var(--color-ink)] px-4 text-sm font-medium text-[var(--color-ink-inverse)] transition-opacity hover:opacity-90"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-[var(--container-max)] items-center gap-10 px-5 pb-16 pt-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:pb-24 lg:pt-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] px-3 py-1 text-[12.5px] font-medium text-[var(--color-ink-muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
              VIT Bhopal students only
            </p>

            <h1 className="mt-5 text-[clamp(2.25rem,6vw,3.75rem)] font-semibold leading-[1.05] tracking-[-0.035em] text-[var(--color-ink)]">
              The campus
              <br />
              marketplace.
            </h1>

            <p className="mt-5 max-w-[46ch] text-[16px] leading-relaxed text-[var(--color-ink-muted)] sm:text-[17px]">
              Textbooks, cycles, hostel gear, calculators, tickets - buy and sell
              with people two blocks away. No shipping, no strangers, no fees.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="inline-flex h-12 items-center rounded-[12px] bg-[var(--color-ink)] px-7 text-[15px] font-medium text-[var(--color-ink-inverse)] transition-opacity hover:opacity-90"
              >
                Get started
              </Link>
              <Link
                href="/search"
                className="inline-flex h-12 items-center rounded-[12px] border border-[var(--color-line-strong)] px-7 text-[15px] font-medium text-[var(--color-ink)] transition-colors hover:bg-[var(--color-surface-hover)]"
              >
                Browse listings
              </Link>
            </div>

            {stats.listings > 0 && (
              <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-4">
                <Stat value={stats.listings} label="live listings" />
                <Stat value={stats.students} label="students" />
                <Stat value={stats.sold} label="items rehomed" />
              </dl>
            )}
          </div>

          <div aria-hidden className="hidden justify-self-center lg:block">
            <AuthIllustration className="h-auto w-full max-w-[440px]" />
          </div>
        </section>

        <section className="border-t border-[var(--color-line)] bg-[var(--color-surface-sunken)]">
          <div className="mx-auto max-w-[var(--container-max)] px-5 py-14">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-subtle)]">
              What students trade
            </h2>

            <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {categories.slice(0, 12).map((category) => (
                <li key={category.id}>
                  <Link
                    href={`/search?category=${category.slug}`}
                    className="flex items-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] px-3.5 py-3 transition-colors hover:border-[var(--color-line-strong)]"
                  >
                    <CategoryIcon
                      name={category.icon}
                      className="h-4 w-4 shrink-0 text-[var(--color-ink-muted)]"
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--color-ink)]">
                      {category.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-[var(--container-max)] px-5 py-16">
          <div className="grid gap-8 sm:grid-cols-3">
            <Feature
              title="Verified classmates"
              body="Every account is tied to a verified phone number, and a VIT email earns a badge. You always know who you're meeting."
            />
            <Feature
              title="Your number stays private"
              body="Buyers chat in-app first. Your phone number is only shared when you personally approve the request."
            />
            <Feature
              title="Meet at your block"
              body="Hostellers share a block and a time window. Day scholars share an area. Nothing ships, nothing gets lost."
            />
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--color-line)]">
        <div className="mx-auto flex max-w-[var(--container-max)] flex-wrap items-center justify-between gap-4 px-5 py-8">
          <LogoLockup />
          <p className="text-[12.5px] text-[var(--color-ink-subtle)]">
            Built for VIT Bhopal. Not affiliated with the university administration.
          </p>
        </div>
      </footer>
    </div>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd>
        <span className="block text-[26px] font-semibold tracking-[-0.02em] text-[var(--color-ink)]">
          {value.toLocaleString('en-IN')}
        </span>
        <span className="text-[13px] text-[var(--color-ink-muted)]">{label}</span>
      </dd>
    </div>
  )
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="text-[15px] font-semibold text-[var(--color-ink)]">{title}</h3>
      <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-ink-muted)]">{body}</p>
    </div>
  )
}

/**
 * Headline counts. Wrapped so a cold database on first deploy renders zeros
 * instead of failing the whole page.
 */
async function loadPublicStats(): Promise<{
  listings: number
  students: number
  sold: number
}> {
  try {
    const [listings, students, sold] = await Promise.all([
      db.listing.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      db.user.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      db.listing.count({ where: { status: 'SOLD' } }),
    ])
    return { listings, students, sold }
  } catch {
    return { listings: 0, students: 0, sold: 0 }
  }
}
