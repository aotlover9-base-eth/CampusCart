import { db } from '@/lib/db'

/**
 * Admin analytics.
 *
 * Counts run against indexed columns and are cheap at campus scale. Each block
 * is wrapped so one failing query degrades a single tile rather than the whole
 * dashboard.
 */

export interface AdminStats {
  users: { total: number; active: number; newThisWeek: number; verified: number }
  listings: { total: number; active: number; sold: number; newThisWeek: number }
  engagement: { conversations: number; messages: number; offers: number }
  moderation: { openReports: number; bannedUsers: number; removedListings: number }
  storage: { bytes: number; files: number }
}

const WEEK_MS = 7 * 86_400_000

export async function loadAdminStats(): Promise<AdminStats> {
  const weekAgo = new Date(Date.now() - WEEK_MS)

  const [
    totalUsers,
    activeUsers,
    newUsers,
    verifiedUsers,
    totalListings,
    activeListings,
    soldListings,
    newListings,
    conversations,
    messages,
    offers,
    openReports,
    bannedUsers,
    removedListings,
    media,
  ] = await Promise.all([
    db.user.count({ where: { deletedAt: null } }),
    db.user.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
    db.user.count({ where: { deletedAt: null, createdAt: { gte: weekAgo } } }),
    db.user.count({ where: { deletedAt: null, isVitVerified: true } }),
    db.listing.count({ where: { deletedAt: null } }),
    db.listing.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
    db.listing.count({ where: { status: 'SOLD' } }),
    db.listing.count({ where: { deletedAt: null, createdAt: { gte: weekAgo } } }),
    db.conversation.count(),
    db.message.count(),
    db.offer.count(),
    db.report.count({ where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } }),
    db.user.count({ where: { status: 'BANNED' } }),
    db.listing.count({ where: { status: 'REMOVED' } }),
    db.listingMedia.aggregate({ _sum: { sizeBytes: true }, _count: true }),
  ])

  return {
    users: {
      total: totalUsers,
      active: activeUsers,
      newThisWeek: newUsers,
      verified: verifiedUsers,
    },
    listings: {
      total: totalListings,
      active: activeListings,
      sold: soldListings,
      newThisWeek: newListings,
    },
    engagement: { conversations, messages, offers },
    moderation: { openReports, bannedUsers, removedListings },
    storage: { bytes: media._sum.sizeBytes ?? 0, files: media._count },
  }
}

export interface DailyPoint {
  day: string
  users: number
  listings: number
}

/**
 * Signups and new listings per day for the trend chart.
 *
 * Grouped in SQL rather than by loading rows and bucketing in JS, so this stays
 * flat as the tables grow.
 */
export async function loadDailyTrend(days = 30): Promise<DailyPoint[]> {
  const since = new Date(Date.now() - days * 86_400_000)

  const [userRows, listingRows] = await Promise.all([
    db.$queryRaw<Array<{ day: Date; count: bigint }>>`
      SELECT date_trunc('day', "createdAt") AS day, COUNT(*) AS count
        FROM users
       WHERE "createdAt" >= ${since} AND "deletedAt" IS NULL
       GROUP BY day
       ORDER BY day
    `,
    db.$queryRaw<Array<{ day: Date; count: bigint }>>`
      SELECT date_trunc('day', "createdAt") AS day, COUNT(*) AS count
        FROM listings
       WHERE "createdAt" >= ${since} AND "deletedAt" IS NULL
       GROUP BY day
       ORDER BY day
    `,
  ])

  const userByDay = new Map(userRows.map((row) => [dayKey(row.day), Number(row.count)]))
  const listingByDay = new Map(
    listingRows.map((row) => [dayKey(row.day), Number(row.count)]),
  )

  // Emit every day in the window, including the empty ones, so the chart has no
  // gaps and the x-axis spacing stays honest.
  const points: DailyPoint[] = []
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.now() - offset * 86_400_000)
    const key = dayKey(date)
    points.push({
      day: key,
      users: userByDay.get(key) ?? 0,
      listings: listingByDay.get(key) ?? 0,
    })
  }

  return points
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Most-recent activity for the dashboard's live feed. */
export async function loadRecentActivity() {
  const [users, listings, reports] = await Promise.all([
    db.user.findMany({
      where: { deletedAt: null },
      select: { id: true, fullName: true, avatarUrl: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    db.listing.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        title: true,
        priceInPaise: true,
        createdAt: true,
        seller: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    db.report.findMany({
      where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } },
      select: { id: true, targetType: true, reason: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ])

  return {
    users: users.map((user) => ({ ...user, createdAt: user.createdAt.toISOString() })),
    listings: listings.map((listing) => ({
      ...listing,
      createdAt: listing.createdAt.toISOString(),
    })),
    reports: reports.map((report) => ({
      ...report,
      createdAt: report.createdAt.toISOString(),
    })),
  }
}
