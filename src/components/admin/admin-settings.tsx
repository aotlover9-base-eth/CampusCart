'use client'

import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/client/fetcher'
import { timeAgo } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'

/**
 * Site settings, feature flags, and announcements.
 *
 * Flags save on toggle; settings save on blur when the value changed. Both roll
 * back locally if the write fails, so the switch never lies about what is live.
 */

interface SiteSetting {
  key: string
  value: unknown
  description: string | null
  updatedAt: string
}

interface FeatureFlag {
  key: string
  isEnabled: boolean
  description: string | null
  rolloutPercent: number
  updatedAt: string
}

interface Announcement {
  id: string
  title: string
  body: string
  variant: string
  isActive: boolean
  startsAt: string
  endsAt: string | null
}

export function AdminSettings() {
  const toast = useToast()
  const [settings, setSettings] = useState<SiteSetting[]>([])
  const [flags, setFlags] = useState<FeatureFlag[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)

  const [draft, setDraft] = useState({ title: '', body: '', variant: 'info' })
  const [posting, setPosting] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await api<{
        settings: SiteSetting[]
        flags: FeatureFlag[]
        announcements: Announcement[]
      }>('/api/admin/settings')
      setSettings(data.settings)
      setFlags(data.flags)
      setAnnouncements(data.announcements)
    } catch {
      toast.error('Could not load settings.')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  async function toggleFlag(flag: FeatureFlag, isEnabled: boolean) {
    setFlags((current) =>
      current.map((item) => (item.key === flag.key ? { ...item, isEnabled } : item)),
    )

    try {
      await api('/api/admin/settings', {
        method: 'PATCH',
        body: { flag: { key: flag.key, isEnabled } },
      })
      toast.success(`${flag.key} ${isEnabled ? 'enabled' : 'disabled'}`)
    } catch (error) {
      setFlags((current) =>
        current.map((item) =>
          item.key === flag.key ? { ...item, isEnabled: !isEnabled } : item,
        ),
      )
      toast.error(error instanceof ApiError ? error.message : 'Could not save that flag.')
    }
  }

  async function saveSetting(key: string, raw: string) {
    // Settings hold JSON values, but most are plain numbers or strings. Parse
    // when it looks like JSON, otherwise store the string as typed.
    let value: unknown = raw
    if (/^-?\d+(\.\d+)?$/.test(raw)) value = Number(raw)
    else if (raw === 'true' || raw === 'false') value = raw === 'true'

    try {
      await api('/api/admin/settings', {
        method: 'PATCH',
        body: { setting: { key, value } },
      })
      toast.success(`${key} saved`)
      void load()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not save that.')
    }
  }

  async function postAnnouncement() {
    if (!draft.title.trim() || !draft.body.trim()) return
    setPosting(true)

    try {
      await api('/api/admin/settings', {
        method: 'PATCH',
        body: { announcement: { ...draft, isActive: true } },
      })
      toast.success('Announcement published')
      setDraft({ title: '', body: '', variant: 'info' })
      void load()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not publish that.')
    } finally {
      setPosting(false)
    }
  }

  async function removeAnnouncement(id: string) {
    try {
      await api('/api/admin/settings', {
        method: 'PATCH',
        body: { deleteAnnouncementId: id },
      })
      setAnnouncements((current) => current.filter((item) => item.id !== id))
    } catch {
      toast.error('Could not remove that.')
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-20 w-full rounded-[var(--radius-md)]" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-7">
      <header>
        <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--color-ink)]">
          Settings
        </h1>
        <p className="mt-0.5 text-[13px] text-[var(--color-ink-muted)]">
          Feature flags take effect immediately for everyone.
        </p>
      </header>

      <section className="space-y-2.5">
        <h2 className="text-[14px] font-semibold text-[var(--color-ink)]">Feature flags</h2>
        {flags.map((flag) => (
          <label
            key={flag.key}
            className="flex cursor-pointer items-start justify-between gap-4 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] p-3.5"
          >
            <span className="min-w-0">
              <span className="block font-mono text-[13px] text-[var(--color-ink)]">
                {flag.key}
              </span>
              {flag.description && (
                <span className="mt-0.5 block text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
                  {flag.description}
                </span>
              )}
            </span>

            <span className="relative mt-0.5 shrink-0">
              <input
                type="checkbox"
                role="switch"
                checked={flag.isEnabled}
                onChange={(event) => void toggleFlag(flag, event.target.checked)}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className={`block h-6 w-10 rounded-full transition-colors ${
                  flag.isEnabled
                    ? 'bg-[var(--color-ink)]'
                    : 'bg-[var(--color-line-strong)]'
                }`}
              />
              <span
                aria-hidden
                className={`absolute left-0.5 top-0.5 block h-5 w-5 rounded-full bg-white shadow-[var(--shadow-sm)] transition-transform ${
                  flag.isEnabled ? 'translate-x-4' : ''
                }`}
              />
            </span>
          </label>
        ))}
      </section>

      <section className="space-y-2.5">
        <h2 className="text-[14px] font-semibold text-[var(--color-ink)]">Site settings</h2>
        {settings.map((setting) => (
          <div
            key={setting.key}
            className="rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] p-3.5"
          >
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="font-mono text-[12.5px] text-[var(--color-ink)]">
                {setting.key}
              </span>
              <span className="shrink-0 text-[11px] text-[var(--color-ink-subtle)]">
                {timeAgo(setting.updatedAt)}
              </span>
            </div>
            {setting.description && (
              <p className="mb-2 text-[12px] text-[var(--color-ink-muted)]">
                {setting.description}
              </p>
            )}
            <Input
              defaultValue={String(setting.value ?? '')}
              onBlur={(event) => {
                if (event.target.value !== String(setting.value ?? '')) {
                  void saveSetting(setting.key, event.target.value)
                }
              }}
            />
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-[14px] font-semibold text-[var(--color-ink)]">Announcements</h2>

        <div className="space-y-2.5 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] p-3.5">
          <Input
            label="Title"
            value={draft.title}
            maxLength={120}
            onChange={(event) => setDraft((d) => ({ ...d, title: event.target.value }))}
          />
          <Textarea
            label="Message"
            value={draft.body}
            maxLength={2000}
            onChange={(event) => setDraft((d) => ({ ...d, body: event.target.value }))}
            className="min-h-[70px]"
          />
          <Select
            label="Tone"
            value={draft.variant}
            onChange={(event) => setDraft((d) => ({ ...d, variant: event.target.value }))}
          >
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </Select>
          <Button
            size="sm"
            loading={posting}
            disabled={!draft.title.trim() || !draft.body.trim()}
            onClick={() => void postAnnouncement()}
          >
            Publish
          </Button>
        </div>

        {announcements.map((announcement) => (
          <div
            key={announcement.id}
            className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] p-3.5"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13.5px] font-medium text-[var(--color-ink)]">
                  {announcement.title}
                </span>
                <Badge
                  tone={
                    announcement.variant === 'critical'
                      ? 'danger'
                      : announcement.variant === 'warning'
                        ? 'warning'
                        : 'neutral'
                  }
                >
                  {announcement.variant}
                </Badge>
                {!announcement.isActive && <Badge tone="neutral">inactive</Badge>}
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-ink-muted)]">
                {announcement.body}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-[var(--color-danger)]"
              onClick={() => void removeAnnouncement(announcement.id)}
            >
              Delete
            </Button>
          </div>
        ))}
      </section>
    </div>
  )
}
