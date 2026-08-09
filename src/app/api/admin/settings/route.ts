import { NextResponse } from 'next/server'
import { z } from 'zod'
import { handler, mutation, ok, parseBody } from '@/lib/api'
import { auditLog, requireAdmin, requireAdminRole } from '@/lib/admin/auth'
import { db } from '@/lib/db'

/**
 * GET   /api/admin/settings - site settings, feature flags, announcements
 * PATCH /api/admin/settings - update any of the three
 *
 * Settings are stored as key/value rows rather than columns so a new toggle is
 * a seed entry, not a migration.
 */

export async function GET(): Promise<NextResponse> {
  return handler(async () => {
    await requireAdmin()

    const [settings, flags, announcements] = await Promise.all([
      db.siteSetting.findMany({ orderBy: { key: 'asc' } }),
      db.featureFlag.findMany({ orderBy: { key: 'asc' } }),
      db.announcement.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
    ])

    return ok({
      settings: settings.map((setting) => ({
        ...setting,
        updatedAt: setting.updatedAt.toISOString(),
      })),
      flags: flags.map((flag) => ({ ...flag, updatedAt: flag.updatedAt.toISOString() })),
      announcements: announcements.map((announcement) => ({
        ...announcement,
        startsAt: announcement.startsAt.toISOString(),
        endsAt: announcement.endsAt?.toISOString() ?? null,
        createdAt: announcement.createdAt.toISOString(),
      })),
    })
  })
}

const patchSchema = z.object({
  setting: z
    .object({
      key: z.string().min(1).max(80),
      value: z.unknown(),
    })
    .optional(),
  flag: z
    .object({
      key: z.string().min(1).max(80),
      isEnabled: z.boolean(),
      rolloutPercent: z.coerce.number().int().min(0).max(100).optional(),
    })
    .optional(),
  announcement: z
    .object({
      title: z.string().trim().min(1).max(120),
      body: z.string().trim().min(1).max(2_000),
      variant: z.enum(['info', 'warning', 'critical']).default('info'),
      isActive: z.boolean().default(true),
      endsAt: z.string().datetime().optional(),
    })
    .optional(),
  deleteAnnouncementId: z.string().min(1).optional(),
})

export async function PATCH(request: Request): Promise<NextResponse> {
  return mutation(async () => {
    // Site configuration is SUPER_ADMIN only - these switches affect everyone.
    const admin = await requireAdminRole()
    const body = await parseBody(request, patchSchema)

    if (body.setting) {
      await db.siteSetting.upsert({
        where: { key: body.setting.key },
        update: { value: body.setting.value as never, updatedById: admin.id },
        create: {
          key: body.setting.key,
          value: body.setting.value as never,
          updatedById: admin.id,
        },
      })

      void auditLog({
        adminId: admin.id,
        action: 'settings.update',
        entityType: 'siteSetting',
        entityId: body.setting.key,
        summary: `Updated ${body.setting.key}`,
        metadata: { value: body.setting.value },
      })
    }

    if (body.flag) {
      await db.featureFlag.upsert({
        where: { key: body.flag.key },
        update: {
          isEnabled: body.flag.isEnabled,
          ...(body.flag.rolloutPercent !== undefined
            ? { rolloutPercent: body.flag.rolloutPercent }
            : {}),
        },
        create: {
          key: body.flag.key,
          isEnabled: body.flag.isEnabled,
          rolloutPercent: body.flag.rolloutPercent ?? 100,
        },
      })

      void auditLog({
        adminId: admin.id,
        action: 'flag.update',
        entityType: 'featureFlag',
        entityId: body.flag.key,
        summary: `${body.flag.isEnabled ? 'Enabled' : 'Disabled'} ${body.flag.key}`,
      })
    }

    if (body.announcement) {
      const created = await db.announcement.create({
        data: {
          title: body.announcement.title,
          body: body.announcement.body,
          variant: body.announcement.variant,
          isActive: body.announcement.isActive,
          endsAt: body.announcement.endsAt ? new Date(body.announcement.endsAt) : null,
        },
        select: { id: true },
      })

      void auditLog({
        adminId: admin.id,
        action: 'announcement.create',
        entityType: 'announcement',
        entityId: created.id,
        summary: body.announcement.title,
      })
    }

    if (body.deleteAnnouncementId) {
      await db.announcement.delete({ where: { id: body.deleteAnnouncementId } })

      void auditLog({
        adminId: admin.id,
        action: 'announcement.delete',
        entityType: 'announcement',
        entityId: body.deleteAnnouncementId,
      })
    }

    return ok({ updated: true })
  })
}
