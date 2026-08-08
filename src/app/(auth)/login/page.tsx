import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/session-user'
import { LoginForm } from './login-form'

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to CampusCart with your phone number or VIT email.',
}

export default async function LoginPage() {
  // Already signed in — no reason to show the form again.
  const user = await getSessionUser()
  if (user) redirect('/home')

  return <LoginForm />
}
