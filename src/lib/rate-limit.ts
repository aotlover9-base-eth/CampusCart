import { db } from './db'
import { env } from './env'
import { hashIp } from './crypto'

/**
 * Database-backed sliding-window rate limiter.
 *
 * Serverless functions have no shared memory, so counters live in Postgres.
 * Each check deletes expired hits for the bucket, counts what remains, and
 * inserts a new hit when the request is allowed. Swap in Redis/Upstash later by
 * reimplementing `consume` - every caller goes through it.
 */

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  limit: number
  retryAfterSeconds: number
}

export interface RateLimitOptions {
  /** Unique bucket key, e.g. `otp:send:+919812345678`. */
  bucket: string
  limit: number
  windowSeconds: number
}

const memoryBuckets =
  (globalThis as unknown as { __rateLimitCache?: Map<string, number[]> }).__rateLimitCache ??
  new Map<string, number[]>()

if (!(globalThis as unknown as { __rateLimitCache?: Map<string, number[]> }).__rateLimitCache) {
  ;(globalThis as unknown as { __rateLimitCache?: Map<string, number[]> }).__rateLimitCache =
    memoryBuckets
}

export async function consume(options: RateLimitOptions): Promise<RateLimitResult> {
  const { bucket, limit, windowSeconds } = options
  const now = Date.now()
  const cutoffTime = now - windowSeconds * 1_000

  // In-memory fast-path check
  let timestamps = memoryBuckets.get(bucket) ?? []
  timestamps = timestamps.filter((t) => t > cutoffTime)

  if (timestamps.length >= limit) {
    const oldest = timestamps[0] ?? now
    const resetAt = oldest + windowSeconds * 1_000
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1_000))
    return { allowed: false, remaining: 0, limit, retryAfterSeconds }
  }

  const cutoff = new Date(cutoffTime)

  const used = await db.rateLimitHit.count({
    where: { bucket, createdAt: { gte: cutoff } },
  })

  if (used >= limit) {
    const oldest = await db.rateLimitHit.findFirst({
      where: { bucket, createdAt: { gte: cutoff } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    })

    const resetAt = (oldest?.createdAt.getTime() ?? now) + windowSeconds * 1_000
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1_000))

    return { allowed: false, remaining: 0, limit, retryAfterSeconds }
  }

  timestamps.push(now)
  memoryBuckets.set(bucket, timestamps)

  // Probabilistic background cleanup (1 in 50 calls) to avoid redundant sync deletes on every request
  if (Math.random() < 0.02) {
    void db.rateLimitHit
      .deleteMany({ where: { bucket, createdAt: { lt: cutoff } } })
      .catch(() => null)
  }

  await db.rateLimitHit.create({ data: { bucket } })

  return {
    allowed: true,
    remaining: Math.max(0, limit - used - 1),
    limit,
    retryAfterSeconds: 0,
  }
}

/** General API limit, keyed by user when known and hashed IP otherwise. */
export function apiLimiter(identifier: string): Promise<RateLimitResult> {
  const { RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_SECONDS } = env()
  return consume({
    bucket: `api:${identifier}`,
    limit: RATE_LIMIT_MAX_REQUESTS,
    windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
  })
}

/** OTP sends are limited per destination - the expensive, abusable action. */
export function otpSendLimiter(destination: string): Promise<RateLimitResult> {
  return consume({
    bucket: `otp:send:${destination}`,
    limit: env().RATE_LIMIT_OTP_MAX,
    windowSeconds: 3_600,
  })
}

/** A second OTP limit per IP, to stop one host enumerating many numbers. */
export function otpIpLimiter(ip: string | null): Promise<RateLimitResult> {
  return consume({
    bucket: `otp:ip:${hashIp(ip) ?? 'unknown'}`,
    limit: env().RATE_LIMIT_OTP_MAX * 3,
    windowSeconds: 3_600,
  })
}

/** Verification attempts, to stop brute-forcing a 6-digit code. */
export function otpVerifyLimiter(destination: string): Promise<RateLimitResult> {
  return consume({
    bucket: `otp:verify:${destination}`,
    limit: 10,
    windowSeconds: 900,
  })
}

/** Login attempts against the hidden admin panel - deliberately tight. */
export function adminLoginLimiter(identifier: string): Promise<RateLimitResult> {
  return consume({
    bucket: `admin:login:${identifier}`,
    limit: 5,
    windowSeconds: 900,
  })
}

/** Write-path limit for listing creation and messaging. */
export function writeLimiter(userId: string, action: string): Promise<RateLimitResult> {
  return consume({
    bucket: `write:${action}:${userId}`,
    limit: action === 'message' ? 60 : 20,
    windowSeconds: 60,
  })
}

/** Best-effort sweep of stale rows across all buckets. */
export async function pruneRateLimitHits(olderThanSeconds = 86_400): Promise<number> {
  const { count } = await db.rateLimitHit.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - olderThanSeconds * 1_000) } },
  })
  return count
}
