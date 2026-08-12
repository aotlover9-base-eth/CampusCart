import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/session-user'
import { OnboardingForm } from './onboarding-form'

export const metadata: Metadata = {
  title: 'Create your profile',
  description: 'Finish setting up your CampusCart account.',
  robots: { index: false, follow: false },
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; fullName?: string; password?: string; next?: string }>
}) {
  const user = await getSessionUser()
  if (user) redirect('/home')

  const { email, fullName, password, next } = await searchParams

  if (!email) redirect('/login')

  return (
    <OnboardingForm
      email={email}
      initialFullName={fullName ?? ''}
      initialPassword={password ?? ''}
      nextPath={next ?? null}
    />
  )
}
