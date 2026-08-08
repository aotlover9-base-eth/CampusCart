import type { Metadata } from 'next'
import { getSessionUser } from '@/lib/auth/session-user'
import { listCategories } from '@/lib/categories'
import { ListingComposer } from '@/components/sell/listing-composer'

export const metadata: Metadata = {
  title: 'Sell an item',
  description: 'List something for sale on CampusCart.',
}

export const dynamic = 'force-dynamic'

/**
 * Compose screen.
 *
 * The layout already guarantees a signed-in user; this reads them again only to
 * prefill the pickup location from their saved profile, so a hosteller does not
 * retype their block on every listing.
 */
export default async function SellPage() {
  const [user, categories] = await Promise.all([getSessionUser(), listCategories()])

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 sm:py-7">
      <header className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--color-ink)] sm:text-[26px]">
          Sell an item
        </h1>
        <p className="mt-1 text-[13px] text-[var(--color-ink-muted)]">
          Good photos and an honest condition sell faster than a low price.
        </p>
      </header>

      <ListingComposer
        categories={categories}
        defaultLocation={{
          role: user?.role ?? 'OTHER',
          hostelBlock: user?.hostelBlock ?? null,
          latitude: user?.latitude ?? null,
          longitude: user?.longitude ?? null,
          locationLabel: user?.locationLabel ?? null,
        }}
      />
    </div>
  )
}
