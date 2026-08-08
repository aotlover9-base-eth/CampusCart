import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/session-user'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { SettingsForm } from '@/components/settings/settings-form'

export const metadata: Metadata = {
  title: 'Settings',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  // Preferences live in their own table and are created lazily, so a user who
  // signed up before a field existed still gets sensible defaults here.
  const settings = await db.userSettings.findUnique({
    where: { userId: user.id },
    select: {
      showRole: true,
      showDepartment: true,
      requirePhoneApproval: true,
      notifyNewMessage: true,
      notifyOffers: true,
      notifyPhoneRequests: true,
      notifyAnnouncements: true,
      emailDigest: true,
    },
  })

  return (
    <div className="mx-auto max-w-2xl px-4 py-5 sm:py-7">
      <header className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--color-ink)] sm:text-[26px]">
          Settings
        </h1>
        <p className="mt-0.5 text-[13px] text-[var(--color-ink-muted)]">
          Profile, privacy, and notifications.
        </p>
      </header>

      <SettingsForm
        user={user}
        vitDomain={env().VIT_EMAIL_DOMAIN}
        settings={
          settings ?? {
            showRole: true,
            showDepartment: true,
            requirePhoneApproval: true,
            notifyNewMessage: true,
            notifyOffers: true,
            notifyPhoneRequests: true,
            notifyAnnouncements: true,
            emailDigest: false,
          }
        }
      />
    </div>
  )
}
