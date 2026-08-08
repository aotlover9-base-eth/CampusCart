import type { Metadata } from 'next'
import { loadAdminStats, loadDailyTrend, loadRecentActivity } from '@/lib/admin/stats'
import { formatBytes, formatPrice, timeAgo } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { TrendChart } from '@/components/admin/trend-chart'

export const metadata: Metadata = {
  title: 'Overview',
  robots: { index: false, follow: false, nocache: true },
}

export const dynamic = 'force-dynamic'

export default async function AdminDashboardPage() {
  const [stats, trend, activity] = await Promise.all([
    loadAdminStats(),
    loadDailyTrend(30),
    loadRecentActivity(),
  ])

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--color-ink)]">
          Overview
        </h1>
        <p className="mt-0.5 text-[13px] text-[var(--color-ink-muted)]">
          Everything happening on CampusCart right now.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Users"
          value={stats.users.total}
          detail={`${stats.users.newThisWeek} joined this week`}
        />
        <StatCard
          label="Active listings"
          value={stats.listings.active}
          detail={`${stats.listings.newThisWeek} posted this week`}
        />
        <StatCard
          label="Messages"
          value={stats.engagement.messages}
          detail={`across ${stats.engagement.conversations} chats`}
        />
        <StatCard
          label="Open reports"
          value={stats.moderation.openReports}
          detail={stats.moderation.openReports > 0 ? 'needs review' : 'all clear'}
          tone={stats.moderation.openReports > 0 ? 'warning' : 'default'}
        />
      </section>

      <section className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 sm:p-5">
        <h2 className="text-[14px] font-semibold text-[var(--color-ink)]">
          Last 30 days
        </h2>
        <p className="mb-4 text-[12.5px] text-[var(--color-ink-muted)]">
          New signups and new listings per day.
        </p>
        <TrendChart points={trend} />
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <Panel title="Newest members">
          {activity.users.length === 0 ? (
            <Empty>No users yet</Empty>
          ) : (
            activity.users.map((user) => (
              <Row key={user.id}>
                <Avatar name={user.fullName} src={user.avatarUrl} size="sm" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--color-ink)]">
                  {user.fullName}
                </span>
                <span className="shrink-0 text-[11.5px] text-[var(--color-ink-subtle)]">
                  {timeAgo(user.createdAt)}
                </span>
              </Row>
            ))
          )}
        </Panel>

        <Panel title="Latest listings">
          {activity.listings.length === 0 ? (
            <Empty>No listings yet</Empty>
          ) : (
            activity.listings.map((listing) => (
              <Row key={listing.id}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-[var(--color-ink)]">
                    {listing.title}
                  </span>
                  <span className="block truncate text-[11.5px] text-[var(--color-ink-subtle)]">
                    {listing.seller.fullName} · {formatPrice(listing.priceInPaise)}
                  </span>
                </span>
                <span className="shrink-0 text-[11.5px] text-[var(--color-ink-subtle)]">
                  {timeAgo(listing.createdAt)}
                </span>
              </Row>
            ))
          )}
        </Panel>

        <Panel title="Reports needing review">
          {activity.reports.length === 0 ? (
            <Empty>Nothing to review</Empty>
          ) : (
            activity.reports.map((report) => (
              <Row key={report.id}>
                <Badge tone="warning">{report.targetType.toLowerCase()}</Badge>
                <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--color-ink)]">
                  {report.reason}
                </span>
                <span className="shrink-0 text-[11.5px] text-[var(--color-ink-subtle)]">
                  {timeAgo(report.createdAt)}
                </span>
              </Row>
            ))
          )}
        </Panel>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="VIT verified" value={stats.users.verified} detail="badged accounts" />
        <StatCard label="Items sold" value={stats.listings.sold} detail="all time" />
        <StatCard label="Offers made" value={stats.engagement.offers} detail="all time" />
        <StatCard
          label="Storage used"
          value={formatBytes(stats.storage.bytes)}
          detail={`${stats.storage.files} files`}
        />
      </section>
    </div>
  )
}

function StatCard({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string
  value: number | string
  detail: string
  tone?: 'default' | 'warning'
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
      <p className="text-[12px] text-[var(--color-ink-muted)]">{label}</p>
      <p
        className={
          tone === 'warning'
            ? 'mt-1 text-[26px] font-semibold tracking-[-0.03em] text-[var(--color-warning)]'
            : 'mt-1 text-[26px] font-semibold tracking-[-0.03em] text-[var(--color-ink)]'
        }
      >
        {typeof value === 'number' ? value.toLocaleString('en-IN') : value}
      </p>
      <p className="mt-0.5 text-[11.5px] text-[var(--color-ink-subtle)]">{detail}</p>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
      <h2 className="mb-2.5 text-[13.5px] font-semibold text-[var(--color-ink)]">{title}</h2>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2.5 py-1.5">{children}</div>
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-3 text-[12.5px] text-[var(--color-ink-subtle)]">{children}</p>
}
