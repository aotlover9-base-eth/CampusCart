import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

/**
 * Admin panel root.
 *
 * Mounted on a dynamic segment because the panel's path is env-configured and
 * unguessable by design. Static routes take priority in the App Router, so this
 * only ever catches single-segment paths that would otherwise 404 — and any
 * segment that isn't the configured one 404s here, identically.
 *
 * Middleware separately gates the session and sets noindex/no-store, so this
 * file's only job is to reject the wrong path before rendering anything.
 */
export default async function AdminPanelLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ panel: string }>
}) {
  const { panel } = await params
  const expected = env().ADMIN_PANEL_PATH.replace(/^\/+|\/+$/g, '')

  if (panel !== expected) notFound()

  return children
}
