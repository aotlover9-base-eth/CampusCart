import { NextResponse } from 'next/server'
import { handler, ok } from '@/lib/api'
import { listCategories } from '@/lib/categories'

/**
 * GET /api/categories
 *
 * The full category tree with live listing counts. Cached briefly - categories
 * change rarely, and every compose screen and filter panel requests this.
 */

// Caching lives in `listCategories` (see lib/categories.ts) rather than here, so
// this route is never prerendered at build time against an unavailable database.
export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  return handler(async () => {
    const categories = await listCategories()
    return ok({ categories })
  })
}
