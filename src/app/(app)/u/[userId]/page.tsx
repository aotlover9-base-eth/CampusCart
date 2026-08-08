import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { currentUser } from '@/lib/auth/context'
import { db } from '@/lib/db'
import { ProfileView } from '@/components/profile/profile-view'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ userId: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { userId } = await params

  const user = await db.user.findFirst({
    where: { id: userId, status: 'ACTIVE', deletedAt: null },
    select: { fullName: true, bio: true, listingCount: true },
  })

  if (!user) return { title: 'Profile not found' }

  return {
    title: user.fullName,
    description:
      user.bio ?? `${user.fullName} has ${user.listingCount} listings on CampusCart.`,
  }
}

/**
 * Public profile.
 *
 * Respects the subject's privacy settings: role and department appear only if
 * they chose to show them, and the email only if it is verified. The phone
 * number is never included — that is the phone-request flow's job alone.
 */
export default async function ProfilePage({ params }: Props) {
  const { userId } = await params
  const viewer = await currentUser()

  const user = await db.user.findFirst({
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
      isOnline: true,
      lastSeenAt: true,
      listingCount: true,
      soldCount: true,
      createdAt: true,
      settings: { select: { showRole: true, showDepartment: true } },
      hostelLocation: { select: { block: true } },
    },
  })

  if (!user) notFound()

  const isYou = viewer?.id === user.id

  return (
    <ProfileView
      user={{
        id: user.id,
        fullName: user.fullName,
        // The owner always sees their own details, regardless of the toggles.
        email: isYou || user.emailVerifiedAt ? user.email : null,
        role: isYou || user.settings?.showRole !== false ? user.role : null,
        department:
          isYou || user.settings?.showDepartment !== false ? user.department : null,
        year: user.year,
        bio: user.bio,
        avatarUrl: user.avatarUrl,
        isVitVerified: user.isVitVerified,
        isOnline: user.isOnline,
        lastSeenAt: user.lastSeenAt.toISOString(),
        listingCount: user.listingCount,
        soldCount: user.soldCount,
        joinedAt: user.createdAt.toISOString(),
        // Only the block, never the room — that is shared in chat.
        hostelBlock: user.hostelLocation?.block ?? null,
      }}
      isYou={isYou}
      isSignedIn={Boolean(viewer)}
    />
  )
}
