import { db } from '../src/lib/db'

async function testQueryPlans() {
  console.log('=== TESTING SQL QUERY PLANS & TIMINGS ===\n')

  // Query 1: Current visibilityWhere
  const t0 = performance.now()
  const currentResult = await db.$queryRaw`
    EXPLAIN ANALYZE
    SELECT "l"."id", "l"."title", "l"."priceInPaise", "l"."publishedAt"
    FROM "listings" AS "l"
    INNER JOIN "users" AS "u" ON ("l"."sellerId" = "u"."id")
    WHERE "l"."deletedAt" IS NULL
      AND ("l"."status" IN ('ACTIVE', 'RESERVED', 'SOLD'))
      AND "u"."status" = 'ACTIVE' AND "u"."deletedAt" IS NULL
    ORDER BY "l"."publishedAt" DESC, "l"."id" DESC
    LIMIT 21;
  `
  const t1 = performance.now()
  console.log(`[Query 1 - Current Join] Execution: ${(t1 - t0).toFixed(1)}ms`)
  console.log(JSON.stringify(currentResult, null, 2))

  // Query 2: Direct listing filter (assuming active seller)
  const t2 = performance.now()
  const directResult = await db.$queryRaw`
    EXPLAIN ANALYZE
    SELECT "l"."id", "l"."title", "l"."priceInPaise", "l"."publishedAt"
    FROM "listings" AS "l"
    WHERE "l"."deletedAt" IS NULL
      AND "l"."status" = 'ACTIVE'
    ORDER BY "l"."publishedAt" DESC, "l"."id" DESC
    LIMIT 21;
  `
  const t3 = performance.now()
  console.log(`\n[Query 2 - Direct Status Index] Execution: ${(t3 - t2).toFixed(1)}ms`)
  console.log(JSON.stringify(directResult, null, 2))

  process.exit(0)
}

testQueryPlans().catch((err) => {
  console.error(err)
  process.exit(1)
})
