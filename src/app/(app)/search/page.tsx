import type { Metadata } from 'next'
import { getSessionUser } from '@/lib/auth/session-user'
import { listCategories } from '@/lib/categories'
import { SearchResults } from '@/components/listing/search-results'

export const metadata: Metadata = {
  title: 'Search',
  description: 'Search listings across VIT Bhopal.',
}

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * Search and browse.
 *
 * The URL is the source of truth for query, category, and sort so results stay
 * shareable and survive a refresh. Everything else lives in the filter sheet.
 */
export default async function SearchPage({ searchParams }: Props) {
  const params = await searchParams
  const [user, categories] = await Promise.all([getSessionUser(), listCategories()])

  const first = (key: string) => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }

  return (
    <SearchResults
      categories={categories}
      initialQuery={first('q') ?? ''}
      initialCategory={first('category')}
      initialSort={first('sort') ?? 'relevance'}
      viewerCoords={
        user?.latitude != null && user?.longitude != null
          ? { lat: user.latitude, lng: user.longitude }
          : null
      }
    />
  )
}
