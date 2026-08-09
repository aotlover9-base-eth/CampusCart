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
  searchParams: Promise<{ email?: string; next?: string }>
}) {
  const user = await getSessionUser()
  if (user) redirect('/home')

  const { email, next } = await searchParams

  // The email address arrives from the OTP verify step. Without it there is no proof
  // of ownership to finish signup against, so send the user back to start.
  if (!email) redirect('/login')

  return <OnboardingForm email={email} nextPath={next ?? null} />
}
