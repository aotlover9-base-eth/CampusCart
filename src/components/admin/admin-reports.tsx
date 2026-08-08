'use client'

import { useState } from 'react'
import Link from 'next/link'
import { api, ApiError } from '@/lib/client/fetcher'
import { timeAgo } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { useToast } from '@/components/ui/toast'
import { ShieldIcon } from '@/components/ui/icons'
import { AdminList, AdminRow, FilterTabs } from './admin-list'

/**
 * Moderation queue.
 *
 * Reading a reported conversation opens a panel that states plainly that the
 * access is recorded — the log entry is written server-side before any message
 * is returned, and the moderator should know that as they do it.
 */

interface AdminReport {
  id: string
  targetType: string
  reason: string
  details: string | null
  status: string
  createdAt: string
  conversationId: string | null
  canReadChat: boolean
  moderationAccessExpiresAt: string | null
  reporter: { id: string; fullName: string; avatarUrl: string | null }
  listing: { id: string; title: string; status: string } | null
  reportedUser: { id: string; fullName: string; avatarUrl: string | null } | null
  message: { id: string; body: string | null; conversationId: string } | null
}

interface ChatMessage {
  id: string
  senderName: string
  senderAvatar: string | null
  body: string | null
  isDeleted: boolean
  mediaUrl: string | null
  createdAt: string
}

const FILTERS = [
  { value: '', label: 'Needs review' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'DISMISSED', label: 'Dismissed' },
]

export function AdminReports() {
  const toast = useToast()
  const [status, setStatus] = useState('')
  const [chat, setChat] = useState<{ report: AdminReport; messages: ChatMessage[] } | null>(
    null,
  )
  const [loadingChat, setLoadingChat] = useState(false)

  async function act(report: AdminReport, action: string, refresh: () => void) {
    try {
      await api('/api/admin/reports', {
        method: 'PATCH',
        body: { reportId: report.id, action },
      })
      toast.success(`Report ${action}d`)
      refresh()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Action failed')
    }
  }

  async function openChat(report: AdminReport) {
    setLoadingChat(true)
    try {
      const result = await api<{ messages: ChatMessage[] }>(
        `/api/admin/reports/${report.id}/messages`,
      )
      setChat({ report, messages: result.messages })
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'Could not open that conversation',
      )
    } finally {
      setLoadingChat(false)
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--color-ink)]">
          Reports
        </h1>
        <p className="mt-0.5 text-[13px] text-[var(--color-ink-muted)]">
          Chat access is limited to 30 days after a report and is always logged.
        </p>
      </header>

      <AdminList<AdminReport>
        endpoint="/api/admin/reports"
        dataKey="reports"
        filters={{ status: status || undefined }}
        toolbar={<FilterTabs options={FILTERS} value={status} onChange={setStatus} />}
        emptyMessage="Nothing to review."
        renderRow={(report, refresh) => (
          <AdminRow tone={report.status === 'OPEN' ? 'warning' : 'default'}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral">{report.targetType.toLowerCase()}</Badge>
                <span className="text-[13.5px] font-medium text-[var(--color-ink)]">
                  {report.reason}
                </span>
                {report.status !== 'OPEN' && (
                  <Badge tone="neutral">{report.status.replace(/_/g, ' ').toLowerCase()}</Badge>
                )}
              </div>

              {report.details && (
                <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-ink-muted)]">
                  {report.details}
                </p>
              )}

              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-[var(--color-ink-subtle)]">
                <Avatar
                  name={report.reporter.fullName}
                  src={report.reporter.avatarUrl}
                  size="xs"
                />
                {report.reporter.fullName} · {timeAgo(report.createdAt)}
                {report.listing && (
                  <>
                    {' · '}
                    <Link
                      href={`/listing/${report.listing.id}`}
                      target="_blank"
                      className="underline hover:text-[var(--color-ink)]"
                    >
                      {report.listing.title}
                    </Link>
                  </>
                )}
                {report.reportedUser && (
                  <>
                    {' · against '}
                    <Link
                      href={`/u/${report.reportedUser.id}`}
                      target="_blank"
                      className="underline hover:text-[var(--color-ink)]"
                    >
                      {report.reportedUser.fullName}
                    </Link>
                  </>
                )}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap gap-1.5">
              {report.canReadChat && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={loadingChat}
                  onClick={() => void openChat(report)}
                >
                  Read chat
                </Button>
              )}
              {report.status !== 'RESOLVED' && (
                <Button size="sm" onClick={() => void act(report, 'resolve', refresh)}>
                  Resolve
                </Button>
              )}
              {report.status === 'OPEN' && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void act(report, 'dismiss', refresh)}
                >
                  Dismiss
                </Button>
              )}
            </div>
          </AdminRow>
        )}
      />

      <Sheet
        open={chat !== null}
        onClose={() => setChat(null)}
        title="Reported conversation"
        description="This read has been recorded in the audit log with your username."
        size="lg"
      >
        <div className="space-y-3 pt-1">
          <p className="flex items-start gap-2 rounded-[var(--radius-sm)] bg-[var(--color-warning-soft)] px-3 py-2 text-[12px] leading-relaxed text-[var(--color-warning)]">
            <ShieldIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Private messages. Read only what the report requires, and act on the
            report rather than anything incidental.
          </p>

          <div className="space-y-2.5">
            {chat?.messages.map((message) => (
              <div key={message.id} className="flex gap-2.5">
                <Avatar
                  name={message.senderName}
                  src={message.senderAvatar}
                  size="xs"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[11.5px] text-[var(--color-ink-subtle)]">
                    {message.senderName} · {timeAgo(message.createdAt)}
                  </p>
                  {message.isDeleted ? (
                    <p className="text-[13px] italic text-[var(--color-ink-subtle)]">
                      Message deleted
                    </p>
                  ) : (
                    <>
                      {message.body && (
                        <p className="whitespace-pre-wrap break-words text-[13px] text-[var(--color-ink)]">
                          {message.body}
                        </p>
                      )}
                      {message.mediaUrl && (
                        /* eslint-disable-next-line @next/next/no-img-element -- moderation preview */
                        <img
                          src={message.mediaUrl}
                          alt=""
                          className="mt-1 max-h-40 rounded-[var(--radius-sm)]"
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Sheet>
    </div>
  )
}
