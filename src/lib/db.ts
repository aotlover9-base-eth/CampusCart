import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'
import { env, isDevelopment } from './env'

/**
 * Prisma 7 client backed by the pg driver adapter.
 *
 * Cached on globalThis in development so Next.js hot reloads don't open a new
 * connection pool on every edit (Neon has a connection ceiling).
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: env().DATABASE_URL })

  return new PrismaClient({
    adapter,
    log: isDevelopment ? ['warn', 'error'] : ['error'],
  })
}

export const db: PrismaClient = globalForPrisma.prisma ?? createClient()

globalForPrisma.prisma = db
