import { NextResponse } from 'next/server'
import { mutation, ok } from '@/lib/api'
import {
  auditLog,
  clearAdminCookie,
  currentAdmin,
  revokeAdminSession,
} from '@/lib/admin/auth'

/**
 * POST /api/admin/logout
 *
 * Revokes the session row as well as clearing the cookie, so a copied token is
 * dead the moment its owner signs out.
 */
export async function POST(): Promise<NextResponse> {
  return mutation(async () => {
    const admin = await currentAdmin()

    if (admin) {
      await revokeAdminSession(admin.sessionId)
      void auditLog({ adminId: admin.id, action: 'admin.logout' })
    }

    return clearAdminCookie(ok({ signedOut: true }))
  })
}
