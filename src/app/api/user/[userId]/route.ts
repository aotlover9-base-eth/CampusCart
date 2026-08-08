import { NextResponse } from 'next/server'
import { fail, handler, ok } from '@/lib/api'
import { currentUser } from '@/lib/auth/context'
import { db } from '@/lib/db'

/**
 * GET /api/user/[userId]
 *
 * Public profile of any user. Phone is never included, and the user's email is
 * visible only when verified and the profile owner chose to show it.
 */

interface Props {
  params: Promise<{ userId: string }>
}

export async function GET(_request: Request, props: Props): Promise<NextResponse> {
  return handler(async () => {
    const { userId } = await props.params
    const viewer = await currentUser()

    const user = await db.user.findUnique({
      where: { id: userId, status: 'ACTIVE', deletedAt: null },
      select: {
        id: true,
        fullName: true,
        email: true,
        emailVerifiedAt: true,
        role: true,
        department: true,
        year: true,
        bio: true,
        avatarUrl: true,
        isVitVerified: true,
        listingCount: true,
        soldCount: true,
        createdAt: true,
        settings: {
          select: { showRole: true, showDepartment: true },
        },
      },
    })

    if (!user) {
      return fail('User not found', 404)
    }

    // Email is shown only when verified and the user wants it public.
    const showEmail = user.emailVerifiedAt && user.email

    return ok({
      user: {
        id: user.id,
        fullName: user.fullName,
        email: showEmail ? user.email : null,
        role: user.settings?.showRole ? user.role : null,
        department: user.settings?.showDepartment ? user.department : null,
        year: user.year,
        bio: user.bio,
        avatarUrl: user.avatarUrl,
        isVitVerified: user.isVitVerified,
        listingCount: user.listingCount,
        soldCount: user.soldCount,
        joinedAt: user.createdAt,
        isYou: viewer?.id === userId,
      },
    })
  })
}
