import { NextResponse } from 'next/server'
import type { Prisma } from '@/generated/prisma/client'
import { handler, ok, parseQuery } from '@/lib/api'
import { currentUser } from '@/lib/auth/context'
import { feedQuerySchema } from '@/lib/validation'
import { db } from '@/lib/db'
import {
  listingCardSelect,
  serializeListingCard,
  viewerInteractions,
  visibilityWhere,
} from '@/lib/listings'

/**
 * GET /api/search — fuzzy listing search with pg_trgm similarity ranking.
 *
 * The feed's ILIKE filter is fine once a category or filter is active. This
 * route backs the global search bar: it ranks by relevance rather than recency
 * and tolerates typos ("labtop" finds "laptop").
 *
 * Two stages, deliberately:
 *   1. One parameterised raw query ranks candidate ids by trigram similarity.
 *   2. Every user-supplied filter is then applied through Prisma's type-safe
 *      layer. Filters are never concatenated into SQL.
 */

/** Ranking pool size. Wide enough that filters still leave a full page. */
const CANDIDATE_POOL = 300

/** Below this whole-string similarity the match is noise. */
const SIMILARITY_THRESHOLD = 0.15

/**
 * Word-extent matches are scored against the best word rather than the whole
 * string, so they run hot compared to `similarity()` — a term sharing a couple of
 * trigrams with any word in a long description clears 0.15 easily. This sits
 * higher so a typo still matches ("chargr" → "charger" ≈ 0.7) without every
 * loosely-related word qualifying.
 */
const WORD_SIMILARITY_THRESHOLD = 0.5

export async function GET(request: Request): Promise<NextResponse> {
  return handler(async () => {
    const query = parseQuery(request, feedQuerySchema)
    const viewer = await currentUser()

    const term = query.q?.trim()
    if (!term || term.length < 2) {
      return ok({ listings: [], query: term ?? '', total: 0 })
    }

    // Stage 1 — similarity ranking. Prisma's tagged template parameterises
    // every interpolation, so the search term cannot alter the statement.
    //
    // `similarity()` compares whole strings, which collapses to near-zero when a
    // short term is matched against a long description: "charger" against a
    // 90-character description scores below any useful threshold. So description
    // uses `word_similarity(term, text)`, which scores the best-matching word
    // extent inside the longer string instead of the string as a whole.
    //
    // Title keeps both: `similarity` rewards a title that is *entirely* the
    // term, while `word_similarity` still catches one word inside a long title.
    const ranked = await db.$queryRaw<Array<{ id: string; score: number }>>`
      SELECT id,
             GREATEST(
               similarity(title, ${term}),
               word_similarity(${term}, title),
               word_similarity(${term}, description),
               COALESCE(word_similarity(${term}, "customCategoryLabel"), 0)
             ) AS score
        FROM listings
       WHERE "deletedAt" IS NULL
         AND status IN ('ACTIVE', 'RESERVED', 'SOLD')
         AND (
               similarity(title, ${term}) > ${SIMILARITY_THRESHOLD}
            OR word_similarity(${term}, title) > ${WORD_SIMILARITY_THRESHOLD}
            OR word_similarity(${term}, description) > ${WORD_SIMILARITY_THRESHOLD}
            OR COALESCE(word_similarity(${term}, "customCategoryLabel"), 0) > ${WORD_SIMILARITY_THRESHOLD}
         )
       ORDER BY score DESC
       LIMIT ${CANDIDATE_POOL}
    `

    if (ranked.length === 0) {
      return ok({ listings: [], query: term, total: 0 })
    }

    const rankOf = new Map(ranked.map((row, index) => [row.id, index]))

    // Stage 2 — filters, all type-safe.
    const where: Prisma.ListingWhereInput = {
      ...visibilityWhere(viewer?.id),
      id: { in: ranked.map((r) => r.id) },
    }

    const and: Prisma.ListingWhereInput[] = []

    if (query.category) {
      and.push({
        category: { OR: [{ slug: query.category }, { parent: { slug: query.category } }] },
      })
    }

    if (query.condition?.length) {
      and.push({ condition: { in: query.condition as Prisma.EnumListingConditionFilter['in'] } })
    }

    if (query.freeOnly) {
      and.push({ isFree: true })
    } else {
      if (query.minPrice != null) {
        and.push({ priceInPaise: { gte: Math.round(query.minPrice * 100) } })
      }
      if (query.maxPrice != null) {
        and.push({ priceInPaise: { lte: Math.round(query.maxPrice * 100) } })
      }
    }

    if (query.negotiable != null) and.push({ isNegotiable: query.negotiable })
    if (query.hostelBlock) and.push({ hostelBlock: query.hostelBlock })
    if (query.sellerId) and.push({ sellerId: query.sellerId })

    if (query.sellerRole?.length) {
      and.push({ seller: { role: { in: query.sellerRole as Prisma.EnumUserRoleFilter['in'] } } })
    }

    if (query.vitVerifiedOnly) and.push({ seller: { isVitVerified: true } })

    if (and.length > 0) where.AND = and

    const matches = await db.listing.findMany({ where, select: listingCardSelect })

    // Restore similarity order, which Prisma cannot express in orderBy.
    const ordered = matches
      .sort((a, b) => (rankOf.get(a.id) ?? Infinity) - (rankOf.get(b.id) ?? Infinity))
      .slice(0, query.limit)

    const interactions = await viewerInteractions(viewer?.id, ordered.map((l) => l.id))

    const listings = ordered.map((listing) =>
      serializeListingCard(listing, {
        lat: query.lat,
        lng: query.lng,
        ...interactions,
      }),
    )

    return ok({
      listings,
      query: term,
      total: matches.length,
      // The pool is capped, so tell the client when results were truncated
      // rather than implying it saw everything.
      truncated: ranked.length === CANDIDATE_POOL,
    })
  })
}
