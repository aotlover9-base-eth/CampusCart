import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

/**
 * Health check for a local or deployed CampusCart database.
 *
 * Verifies connectivity, that the schema is present, that the trigram search
 * indexes were actually created, and that the seed ran. Run it after
 * `npm run db:setup` to confirm the environment is usable.
 */

const REQUIRED_INDEXES = [
  'listings_title_trgm_idx',
  'listings_description_trgm_idx',
  'listings_custom_category_trgm_idx',
  'categories_name_trgm_idx',
  'users_fullname_trgm_idx',
]

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL ?? ''
  if (!connectionString) {
    console.error('✗ DATABASE_URL is not set. Copy .env.example to .env first.')
    process.exit(1)
  }

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  let failed = false

  try {
    await db.$queryRaw`SELECT 1`
    console.info('✓ database reachable')
  } catch {
    console.error('✗ cannot reach the database — is `docker compose up -d` running?')
    process.exit(1)
  }

  // Schema
  const tables = await db.$queryRawUnsafe<{ count: number }[]>(
    `SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'`,
  )
  const tableCount = tables[0]?.count ?? 0
  if (tableCount > 0) {
    console.info(`✓ schema present (${tableCount} tables)`)
  } else {
    console.error('✗ no tables — run: npm run db:setup')
    failed = true
  }

  // pg_trgm extension
  const extensions = await db.$queryRawUnsafe<unknown[]>(
    `SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'`,
  )
  if (extensions.length > 0) {
    console.info('✓ pg_trgm installed')
  } else {
    console.error('✗ pg_trgm missing — fuzzy search will fail. Run: npm run db:indexes')
    failed = true
  }

  // Search indexes
  const present = await db.$queryRawUnsafe<{ indexname: string }[]>(
    `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
  )
  const names = new Set(present.map((row) => row.indexname))
  const missing = REQUIRED_INDEXES.filter((name) => !names.has(name))

  if (missing.length === 0) {
    console.info(`✓ search indexes present (${REQUIRED_INDEXES.length}/${REQUIRED_INDEXES.length})`)
  } else {
    console.error(`✗ missing indexes: ${missing.join(', ')} — run: npm run db:indexes`)
    failed = true
  }

  // Seed data
  const [categories, flags, settings, admins] = await Promise.all([
    db.category.count(),
    db.featureFlag.count(),
    db.siteSetting.count(),
    db.adminUser.count(),
  ])

  if (categories > 0) {
    console.info(`✓ seeded (${categories} categories, ${flags} flags, ${settings} settings)`)
  } else {
    console.error('✗ no categories — run: npm run db:seed')
    failed = true
  }

  if (admins > 0) {
    console.info(`✓ ${admins} admin account${admins === 1 ? '' : 's'}`)
  } else {
    console.warn('! no admin account yet — run: npm run admin:create')
  }

  await db.$disconnect()
  process.exit(failed ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
