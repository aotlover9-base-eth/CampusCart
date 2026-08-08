import type { Metadata } from 'next'
import { AdminLoginForm } from '@/components/admin/admin-login-form'

/**
 * Admin sign-in.
 *
 * Nothing on this page identifies the product. A visitor who guesses the path
 * learns only that a login form exists here.
 */
export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false, nocache: true },
}

export default function AdminLoginPage() {
  return <AdminLoginForm />
}
