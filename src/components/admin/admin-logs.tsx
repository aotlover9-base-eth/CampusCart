'use client'

import { useState } from 'react'
import { timeAgo } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { AdminList, AdminRow } from './admin-list'

/**
 * Audit trail.
 *
 * Append-only and SUPER_ADMIN-only. Chat reads are the entries that matter most,
 * so they are called out with their own tone rather than blending into the list.
 */

interface AuditEntry {
  id: string
  action: string
  entityType: string | null
  entityId: string | null
  summary: string | null
  metadata: unknown
  createdAt: string
  admin: { id: string; username: string; role: string } | null
}

export function AdminLogs() {
  const [action, setAction] = useState('')

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--color-ink)]">
          Audit log
        </h1>
        <p className="mt-0.5 text-[13px] text-[var(--color-ink-muted)]">
          Every privileged action, append-only. Filter by action prefix, e.g.
          <span className="font-mono"> user.</span> or
          <span className="font-mono"> report.</span>
        </p>
      </header>

      <AdminList<AuditEntry>
        endpoint="/api/admin/logs"
        dataKey="logs"
        filters={{ action: action || undefined }}
        searchValue={action}
        onSearch={setAction}
        searchPlaceholder="Filter by action prefix"
        emptyMessage="No entries."
        renderRow={(entry) => (
          <AdminRow tone={entry.action === 'report.chat.read' ? 'warning' : 'default'}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[12.5px] text-[var(--color-ink)]">
                  {entry.action}
                </span>
                {entry.admin && (
                  <Badge tone="neutral">{entry.admin.username}</Badge>
                )}
              </div>

              {entry.summary && (
                <p className="mt-0.5 text-[12.5px] text-[var(--color-ink-muted)]">
                  {entry.summary}
                </p>
              )}

              {entry.entityType && (
                <p className="text-[11.5px] text-[var(--color-ink-subtle)]">
                  {entry.entityType}:{entry.entityId}
                </p>
              )}
            </div>

            <time
              dateTime={entry.createdAt}
              className="shrink-0 text-[11.5px] text-[var(--color-ink-subtle)]"
            >
              {timeAgo(entry.createdAt)}
            </time>
          </AdminRow>
        )}
      />
    </div>
  )
}
