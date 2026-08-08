'use client'

import { useState } from 'react'
import { api, ApiError } from '@/lib/client/fetcher'
import { timeAgo } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/sheet'
import { useToast } from '@/components/ui/toast'
import { AdminList, AdminRow, FilterTabs } from './admin-list'

/**
 * User moderation.
 *
 * Destructive actions go through a confirmation that states the consequence in
 * plain words — the difference between a suspension and a ban is not obvious
 * from a button label alone.
 */

interface AdminUser {
  id: string
  fullName: string
  email: string | null
  phone: string
  role: string
  department: string | null
  avatarUrl: string | null
  status: string
  statusReason: string | null
  suspendedTill: string | null
  isVitVerified: boolean
  listingCount: number
  soldCount: number
  reportCount: number
  createdAt: string
  lastSeenAt: string
}

type PendingAction = {
  user: AdminUser
  action: 'ban' | 'suspend' | 'delete'
  refresh: () => void
}

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'BANNED', label: 'Banned' },
]

export function AdminUsers() {
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [busy, setBusy] = useState(false)

  async function act(
    user: AdminUser,
    action: string,
    refresh: () => void,
    reason?: string,
  ) {
    setBusy(true)
    try {
      await api('/api/admin/users', {
        method: 'PATCH',
        body: { userId: user.id, action, ...(reason ? { reason } : {}) },
      })
      toast.success(`${user.fullName}: ${action}`)
      setPending(null)
      refresh()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--color-ink)]">
          Users
        </h1>
        <p className="mt-0.5 text-[13px] text-[var(--color-ink-muted)]">
          Search by name or email. Phone matches only on the full number.
        </p>
      </header>

      <AdminList<AdminUser>
        endpoint="/api/admin/users"
        dataKey="users"
        filters={{ q: search || undefined, status: status || undefined }}
        searchValue={search}
        onSearch={setSearch}
        searchPlaceholder="Name, email, or full phone number"
        toolbar={<FilterTabs options={STATUS_FILTERS} value={status} onChange={setStatus} />}
        emptyMessage="No users match."
        renderRow={(user, refresh) => (
          <AdminRow
            tone={
              user.status === 'BANNED'
                ? 'danger'
                : user.status === 'SUSPENDED'
                  ? 'warning'
                  : 'default'
            }
          >
            <Avatar
              name={user.fullName}
              src={user.avatarUrl}
              size="md"
              verified={user.isVitVerified}
            />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-[13.5px] font-medium text-[var(--color-ink)]">
                  {user.fullName}
                </span>
                {user.status !== 'ACTIVE' && (
                  <Badge tone={user.status === 'BANNED' ? 'danger' : 'warning'}>
                    {user.status.toLowerCase()}
                  </Badge>
                )}
                {user.reportCount > 0 && (
                  <Badge tone="warning">{user.reportCount} reports</Badge>
                )}
              </div>

              <p className="truncate text-[12px] text-[var(--color-ink-muted)]">
                {user.email ?? user.phone} · {user.department ?? user.role}
              </p>
              <p className="text-[11.5px] text-[var(--color-ink-subtle)]">
                {user.listingCount} listed · {user.soldCount} sold · joined{' '}
                {timeAgo(user.createdAt)}
                {user.statusReason && ` · ${user.statusReason}`}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap gap-1.5">
              {user.status === 'ACTIVE' ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setPending({ user, action: 'suspend', refresh })}
                  >
                    Suspend
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-[var(--color-danger)]"
                    onClick={() => setPending({ user, action: 'ban', refresh })}
                  >
                    Ban
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void act(user, 'reinstate', refresh)}
                >
                  Reinstate
                </Button>
              )}

              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void act(user, user.isVitVerified ? 'unverify' : 'verify', refresh)
                }
              >
                {user.isVitVerified ? 'Unverify' : 'Verify'}
              </Button>
            </div>
          </AdminRow>
        )}
      />

      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() =>
          pending && void act(pending.user, pending.action, pending.refresh)
        }
        loading={busy}
        title={
          pending?.action === 'ban'
            ? `Ban ${pending.user.fullName}?`
            : pending?.action === 'suspend'
              ? `Suspend ${pending?.user.fullName}?`
              : `Delete ${pending?.user.fullName}?`
        }
        description={
          pending?.action === 'ban'
            ? 'They are signed out everywhere and cannot sign back in. Their listings stay visible until removed separately.'
            : pending?.action === 'suspend'
              ? 'They are signed out and blocked for seven days, then regain access automatically.'
              : 'Their account is closed and hidden. Listings and chat history are retained for moderation.'
        }
        confirmLabel={pending?.action ?? 'Confirm'}
      />
    </div>
  )
}
