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
  searchParams: Promise<{ email?: string; phone?: string; next?: string }>
}) {
  const user = await getSessionUser()
  if (user) redirect('/home')

  const { email, phone, next } = await searchParams
  const userEmail = email ?? phone ?? ''

  if (!userEmail) redirect('/login')

  return <OnboardingForm email={userEmail} nextPath={next ?? null} />
}
