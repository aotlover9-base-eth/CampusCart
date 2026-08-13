import { db } from '../src/lib/db'
import { listingCardSelect, serializeListingCard, viewerInteractions, visibilityWhere } from '../src/lib/listings'

async function runBenchmark() {
  console.log('=== VERIFYING OPTIMIZED CAMPUSCART PERFORMANCE ===\n')

  const t0 = performance.now()
  await db.$queryRaw`SELECT 1`
  const t1 = performance.now()
  console.log(`[1] DB Roundtrip Ping: ${(t1 - t0).toFixed(1)}ms`)

  const where = visibilityWhere(undefined)

  const tList0 = performance.now()
  const rows = await db.listing.findMany({
    where,
    select: listingCardSelect,
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    take: 21,
  })
  const tList1 = performance.now()
  console.log(`[2] Optimized Listing Feed Query (take 21): ${(tList1 - tList0).toFixed(1)}ms (${rows.length} rows)`)

  const page = rows.slice(0, 20)
  const tInt0 = performance.now()
  const interactions = await viewerInteractions(undefined, page.map((r) => r.id))
  const tInt1 = performance.now()
  console.log(`[3] viewerInteractions(): ${(tInt1 - tInt0).toFixed(1)}ms`)

  const tSer0 = performance.now()
  const listings = page.map((row) => serializeListingCard(row, interactions))
  const tSer1 = performance.now()
  console.log(`[4] serializeListingCard(): ${(tSer1 - tSer0).toFixed(1)}ms (${listings.length} cards)`)

  console.log('\n=== VERIFICATION COMPLETE ===')
  process.exit(0)
}

runBenchmark().catch((err) => {
  console.error(err)
  process.exit(1)
})
