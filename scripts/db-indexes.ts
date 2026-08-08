import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

/**
 * One-command local setup: schema, search indexes, seed data.
 *
 * Why this exists rather than `prisma migrate deploy`: the repository ships the
 * trigram migration but no baseline migration, so `migrate` would try to index
 * tables that do not exist yet. `db push` derives the whole schema from
 * schema.prisma, and the raw SQL below adds what push cannot express (a Postgres
 * extension and GIN indexes).
 *
 * Safe to re-run — every statement is idempotent and the seed upserts.
 *
 * For production, generate a real baseline first:
 *   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma \
 *     --script > prisma/migrations/0_init/migration.sql
 * then use `prisma migrate deploy`.
 */

const TRIGRAM_MIGRATION = path.join(
  process.cwd(),
  'prisma/migrations/20260805000001_add_trigram_search/migration.sql',
)

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL ?? ''
  if (!connectionString) {
    console.error('✗ DATABASE_URL is not set. Copy .env.example to .env first.')
    process.exit(1)
  }

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

  try {
    await db.$queryRaw`SELECT 1`
  } catch {
    console.error('✗ Cannot reach the database.')
    console.error('  Start it with:  docker compose up -d')
    process.exit(1)
  }

  // The schema itself is pushed by `npm run db:setup`, which runs `prisma db
  // push` before this script. By here the tables exist.
  console.info('→ Applying search indexes…')

  const sql = await readFile(TRIGRAM_MIGRATION, 'utf8')

  // Strip comment lines first, then split on statement boundaries. Filtering
  // whole statements by "starts with --" would silently drop any statement that
  // happens to carry a leading comment — which is how CREATE EXTENSION got
  // skipped, taking every gin_trgm_ops index down with it.
  const statements = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)

  let applied = 0
  const failures: string[] = []

  for (const statement of statements) {
    // First line is enough to identify the statement in a log message.
    const label = statement.split('\n')[0]?.slice(0, 60) ?? statement.slice(0, 60)

    try {
      await db.$executeRawUnsafe(statement)
      applied += 1
    } catch (error) {
      // Driver errors often leave `message` empty and put the detail on `cause`.
      const detail = describeError(error)
      failures.push(`${label} — ${detail}`)
    }
  }

  console.info(`✓ ${applied}/${statements.length} statements applied`)

  if (failures.length > 0) {
    console.error('\n✗ Some statements failed:')
    for (const failure of failures) console.error(`    ${failure}`)
    console.error(
      '\n  CREATE EXTENSION needs superuser. On a managed host, enable pg_trgm\n' +
        '  from the provider console, then re-run: npm run db:indexes',
    )
    await db.$disconnect()
    process.exit(1)
  }

  await db.$disconnect()
}

/** Driver errors hide the real reason on `cause`; walk the chain for it. */
function describeError(error: unknown): string {
  let current: unknown = error
  const seen = new Set<unknown>()

  while (current instanceof Error && !seen.has(current)) {
    seen.add(current)
    const message = current.message.split('\n')[0]?.trim()
    if (message) return message
    current = current.cause
  }

  return 'unknown error'
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
