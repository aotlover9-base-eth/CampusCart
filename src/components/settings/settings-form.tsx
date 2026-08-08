'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { SessionUser } from '@/lib/auth/context'
import { api, ApiError } from '@/lib/client/fetcher'
import { compressImage } from '@/lib/client/image-compress'
import { cn } from '@/lib/utils'
import { DEPARTMENTS, HOSTEL_BLOCKS, YEAR_OPTIONS, hostelBlockLabel } from '@/lib/constants'
import { useSession } from '@/components/providers/session-provider'
import { useTheme } from '@/components/theme/theme-provider'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { EmailVerification } from './email-verification'

/**
 * Settings.
 *
 * Profile fields save explicitly; toggles save the moment they flip, because a
 * switch that silently needs a separate Save button is the classic way to lose
 * a privacy preference the user thought they had set.
 */

export interface UserSettings {
  showRole: boolean
  showDepartment: boolean
  requirePhoneApproval: boolean
  notifyNewMessage: boolean
  notifyOffers: boolean
  notifyPhoneRequests: boolean
  notifyAnnouncements: boolean
  emailDigest: boolean
}

export function SettingsForm({
  user,
  settings: initialSettings,
  vitDomain,
}: {
  user: SessionUser
  settings: UserSettings
  /** Server-side env value — the domain that grants the VIT badge. */
  vitDomain: string
}) {
  const router = useRouter()
  const toast = useToast()
  const { patch } = useSession()
  const { preference, setPreference } = useTheme()

  const [fullName, setFullName] = useState(user.fullName)
  const [department, setDepartment] = useState(user.department ?? '')
  const [year, setYear] = useState(user.year ? String(user.year) : '')
  const [bio, setBio] = useState(user.bio ?? '')
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl)
  const [hostelBlock, setHostelBlock] = useState(user.hostelBlock ?? '')

  const [settings, setSettings] = useState(initialSettings)
  const [savingProfile, setSavingProfile] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [fields, setFields] = useState<Record<string, string>>({})

  const isHosteller = user.role === 'HOSTELLER'

  async function saveProfile() {
    setSavingProfile(true)
    setFields({})

    try {
      await api('/api/user/me', {
        method: 'PATCH',
        body: {
          fullName: fullName.trim(),
          department: department || undefined,
          year: year ? Number(year) : undefined,
          bio: bio.trim() || null,
          ...(isHosteller && hostelBlock
            ? { hostelLocation: { block: hostelBlock } }
            : {}),
        },
      })

      patch({ fullName: fullName.trim(), department: department || null, bio: bio.trim() || null })
      toast.success('Profile updated')
      router.refresh()
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message)
        if (error.fields) setFields(error.fields)
      } else {
        toast.error('Could not save your profile.')
      }
    } finally {
      setSavingProfile(false)
    }
  }

  async function changeAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setUploadingAvatar(true)
    try {
      const form = new FormData()
      form.set('kind', 'image')
      form.append('files', await compressImage(file))

      const uploaded = await api<{ files: Array<{ url: string }> }>('/api/upload', {
        method: 'POST',
        body: form,
      })

      const url = uploaded.files[0]?.url
      if (!url) throw new Error('no url')

      await api('/api/user/me', { method: 'PATCH', body: { avatarUrl: url } })
      setAvatarUrl(url)
      patch({ avatarUrl: url })
      toast.success('Photo updated')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not upload that photo.')
    } finally {
      setUploadingAvatar(false)
      event.target.value = ''
    }
  }

  /** Toggles persist immediately, rolling back locally if the write fails. */
  async function toggle(key: keyof UserSettings, value: boolean) {
    const previous = settings[key]
    setSettings((current) => ({ ...current, [key]: value }))

    try {
      await api('/api/user/me', { method: 'PATCH', body: { settings: { [key]: value } } })
    } catch {
      setSettings((current) => ({ ...current, [key]: previous }))
      toast.error('Could not save that preference.')
    }
  }

  return (
    <div className="space-y-8 pb-10">
      <Section title="Profile">
        <div className="flex items-center gap-4">
          <Avatar
            name={fullName || user.fullName}
            src={avatarUrl}
            size="lg"
            verified={user.isVitVerified}
          />
          <div>
            <label
              className={cn(
                'inline-flex h-9 cursor-pointer items-center rounded-[10px] border px-3.5 text-[13px] font-medium transition-colors',
                'border-[var(--color-line-strong)] text-[var(--color-ink)] hover:bg-[var(--color-surface-hover)]',
                uploadingAvatar && 'pointer-events-none opacity-60',
              )}
            >
              {uploadingAvatar ? 'Uploading…' : 'Change photo'}
              <input
                type="file"
                accept="image/*"
                onChange={(event) => void changeAvatar(event)}
                className="sr-only"
              />
            </label>
            <p className="mt-1.5 text-[12px] text-[var(--color-ink-subtle)]">
              JPG or PNG, up to 8 MB.
            </p>
          </div>
        </div>

        <Input
          label="Full name"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          error={fields.fullName}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Department"
            placeholder="Select"
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            error={fields.department}
          >
            {DEPARTMENTS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>

          <Select
            label="Year"
            placeholder="Select"
            value={year}
            onChange={(event) => setYear(event.target.value)}
            error={fields.year}
          >
            {YEAR_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </div>

        {isHosteller && (
          <Select
            label="Hostel block"
            placeholder="Select your block"
            value={hostelBlock}
            onChange={(event) => setHostelBlock(event.target.value)}
            hint="Only the block is public. Your room is shared in chat."
          >
            {HOSTEL_BLOCKS.map((item) => (
              <option key={item} value={item}>
                {hostelBlockLabel(item)}
              </option>
            ))}
          </Select>
        )}

        <Textarea
          label="Bio"
          placeholder="A line about you."
          value={bio}
          maxLength={280}
          onChange={(event) => setBio(event.target.value)}
          className="min-h-[80px]"
        />

        <Button loading={savingProfile} onClick={() => void saveProfile()}>
          Save changes
        </Button>
      </Section>

      <Section title="Account">
        <Row
          label="Phone number"
          value={user.phone ?? 'Not linked'}
          hint="Optional. Never shown publicly unless requested."
        />
        <EmailVerification
          currentEmail={user.email}
          isVerified={Boolean(user.emailVerifiedAt)}
          isVitVerified={user.isVitVerified}
          vitDomain={vitDomain}
        />
      </Section>

      <Section title="Appearance">
        <div className="flex gap-2">
          {(['light', 'dark', 'system'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setPreference(option)}
              aria-pressed={preference === option}
              className={cn(
                'flex-1 rounded-[10px] border py-2.5 text-[13px] font-medium capitalize transition-colors',
                preference === option
                  ? 'border-[var(--color-ink)] bg-[var(--color-surface-hover)] text-[var(--color-ink)]'
                  : 'border-[var(--color-line)] text-[var(--color-ink-muted)] hover:border-[var(--color-line-strong)]',
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Privacy">
        <Toggle
          checked={settings.requirePhoneApproval}
          onChange={(value) => void toggle('requirePhoneApproval', value)}
          label="Approve every phone request"
          description="Buyers must ask before seeing your number, and you approve each one. Turning this off still requires a request — it just lets subscribers skip the wait later."
        />
        <Toggle
          checked={settings.showRole}
          onChange={(value) => void toggle('showRole', value)}
          label="Show whether I'm a hosteller"
          description="Appears on your profile and listings."
        />
        <Toggle
          checked={settings.showDepartment}
          onChange={(value) => void toggle('showDepartment', value)}
          label="Show my department"
          description="Appears on your public profile."
        />
      </Section>

      <Section title="Notifications">
        <Toggle
          checked={settings.notifyNewMessage}
          onChange={(value) => void toggle('notifyNewMessage', value)}
          label="New messages"
        />
        <Toggle
          checked={settings.notifyOffers}
          onChange={(value) => void toggle('notifyOffers', value)}
          label="Offers on my listings"
        />
        <Toggle
          checked={settings.notifyPhoneRequests}
          onChange={(value) => void toggle('notifyPhoneRequests', value)}
          label="Phone number requests"
        />
        <Toggle
          checked={settings.notifyAnnouncements}
          onChange={(value) => void toggle('notifyAnnouncements', value)}
          label="Announcements"
          description="Occasional updates about CampusCart itself."
        />
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3.5">
      <h2 className="text-[15px] font-semibold text-[var(--color-ink)]">{title}</h2>
      {children}
    </section>
  )
}

function Row({
  label,
  value,
  hint,
  badge,
}: {
  label: string
  value: string
  hint?: string
  badge?: React.ReactNode
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-line)] p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12.5px] text-[var(--color-ink-subtle)]">{label}</p>
          <p className="mt-0.5 truncate text-[14px] text-[var(--color-ink)]">{value}</p>
        </div>
        {badge}
      </div>
      {hint && (
        <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">{hint}</p>
      )}
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  description?: string
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-[var(--radius-md)] border border-[var(--color-line)] p-3.5">
      <span className="min-w-0">
        <span className="block text-[14px] font-medium text-[var(--color-ink)]">{label}</span>
        {description && (
          <span className="mt-0.5 block text-[12.5px] leading-relaxed text-[var(--color-ink-muted)]">
            {description}
          </span>
        )}
      </span>

      <span className="relative mt-0.5 shrink-0">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className={cn(
            'block h-6 w-10 rounded-full transition-colors duration-200',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--color-accent)] peer-focus-visible:ring-offset-2',
            checked ? 'bg-[var(--color-ink)]' : 'bg-[var(--color-line-strong)]',
          )}
        />
        <span
          aria-hidden
          className={cn(
            'absolute left-0.5 top-0.5 block h-5 w-5 rounded-full bg-white shadow-[var(--shadow-sm)]',
            'transition-transform duration-200 ease-[var(--ease-out-quint)]',
            checked && 'translate-x-4',
          )}
        />
      </span>
    </label>
  )
}
