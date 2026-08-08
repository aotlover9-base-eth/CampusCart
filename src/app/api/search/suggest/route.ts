import { NextResponse } from 'next/server'
import { handler, ok, parseQuery } from '@/lib/api'
import { searchSuggestQuerySchema } from '@/lib/validation'
import { db } from '@/lib/db'

/**
 * GET /api/search/suggest
 *
 * Autocomplete for the search bar. Kept separate from /api/search because it
 * fires on every keystroke and must stay cheap — prefix matching only, no
 * similarity scoring, no media joins.
 */
export async function GET(request: Request): Promise<NextResponse> {
  return handler(async () => {
    const { q, limit } = parseQuery(request, searchSuggestQuerySchema)

    const [categories, listings] = await Promise.all([
      db.category.findMany({
        where: { isActive: true, name: { contains: q, mode: 'insensitive' } },
        select: { name: true, slug: true, icon: true },
        orderBy: { sortOrder: 'asc' },
        take: 4,
      }),
      db.listing.findMany({
        where: {
          deletedAt: null,
          status: 'ACTIVE',
          title: { contains: q, mode: 'insensitive' },
        },
        select: { id: true, title: true },
        orderBy: { publishedAt: 'desc' },
        take: Math.max(1, limit - 4),
      }),
    ])

    const suggestions = [
      ...categories.map((c) => ({
        kind: 'category' as const,
        text: c.name,
        slug: c.slug,
        icon: c.icon,
      })),
      ...listings.map((l) => ({
        kind: 'listing' as const,
        text: l.title,
        listingId: l.id,
      })),
    ].slice(0, limit)

    return ok({ suggestions })
  })
}
