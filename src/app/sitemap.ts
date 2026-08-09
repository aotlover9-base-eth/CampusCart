import type { MetadataRoute } from 'next'
import { db } from '@/lib/db'
import { publicEnv } from '@/lib/env'

/**
 * Sitemap.
 *
 * Only genuinely public, shareable URLs: the landing page, browse, and live
 * listings. Signed-in surfaces and the admin panel are absent by construction -
 * this is built from a query for ACTIVE listings, so a private page cannot leak
 * into it by someone forgetting to exclude it.
 */

const MAX_LISTINGS = 5_000

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicEnv.appUrl.replace(/\/$/, '')

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/search`, changeFrequency: 'hourly', priority: 0.8 },
  ]

  try {
    const [listings, categories] = await Promise.all([
      db.listing.findMany({
        where: { status: 'ACTIVE', deletedAt: null, seller: { status: 'ACTIVE' } },
        select: { id: true, updatedAt: true },
        orderBy: { publishedAt: 'desc' },
        take: MAX_LISTINGS,
      }),
      db.category.findMany({
        where: { isActive: true },
        select: { slug: true, updatedAt: true },
      }),
    ])

    return [
      ...staticRoutes,
      ...categories.map((category) => ({
        url: `${base}/search?category=${category.slug}`,
        lastModified: category.updatedAt,
        changeFrequency: 'daily' as const,
        priority: 0.6,
      })),
      ...listings.map((listing) => ({
        url: `${base}/listing/${listing.id}`,
        lastModified: listing.updatedAt,
        changeFrequency: 'weekly' as const,
        priority: 0.5,
      })),
    ]
  } catch {
    // A database hiccup should degrade the sitemap, not 500 it.
    return staticRoutes
  }
}
