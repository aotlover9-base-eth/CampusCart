import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ListingFeed } from '@/components/listing/listing-feed'

export const metadata: Metadata = {
  title: 'Saved',
  description: 'Listings you bookmarked on CampusCart.',
  robots: { index: false, follow: false },
}

/**
 * Saved listings.
 *
 * Reuses the shared feed against /api/saved, which returns the same envelope.
 * Unsaving a card drops it from the list immediately - the feed's `onRemoved`
 * hook already handles that.
 */
export default function SavedPage() {
  return (
    <div className="mx-auto max-w-[var(--container-max)] px-4 py-5 sm:py-7">
      <header className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--color-ink)] sm:text-[26px]">
          Saved
        </h1>
        <p className="mt-0.5 text-[13px] text-[var(--color-ink-muted)]">
          Only you can see this list.
        </p>
      </header>

      <ListingFeed
        endpoint="/api/saved"
        filters={{}}
        emptyTitle="Nothing saved yet"
        emptyDescription="Tap the bookmark on any listing to keep it here."
        emptyAction={
          <Link href="/home">
            <Button>Browse listings</Button>
          </Link>
        }
      />
    </div>
  )
}
