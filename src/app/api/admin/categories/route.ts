import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { fail, handler, mutation, ok, parseBody } from '@/lib/api'
import { auditLog, requireAdmin, requireAdminRole } from '@/lib/admin/auth'
import { CATEGORY_CACHE_TAG } from '@/lib/categories'
import { slugify } from '@/lib/utils'
import { db } from '@/lib/db'

/**
 * GET    /api/admin/categories — the full tree, including hidden nodes
 * POST   /api/admin/categories — create a category or subcategory
 * PATCH  /api/admin/categories — rename, reorder, show/hide
 * DELETE /api/admin/categories — remove an empty category
 */

export async function GET(): Promise<NextResponse> {
  return handler(async () => {
    await requireAdmin()

    const rows = await db.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        icon: true,
        parentId: true,
        sortOrder: true,
        isActive: true,
        _count: { select: { listings: true, children: true } },
      },
    })

    return ok({
      categories: rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        icon: row.icon,
        parentId: row.parentId,
        sortOrder: row.sortOrder,
        isActive: row.isActive,
        listingCount: row._count.listings,
        childCount: row._count.children,
      })),
    })
  })
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(60),
  parentId: z.string().min(1).optional(),
  icon: z.string().trim().max(40).optional(),
})

export async function POST(request: Request): Promise<NextResponse> {
  return mutation(async () => {
    const admin = await requireAdminRole('MODERATOR')
    const body = await parseBody(request, createSchema)

    const slug = slugify(body.name)
    const clash = await db.category.findUnique({ where: { slug }, select: { id: true } })
    if (clash) return fail('A category with that name already exists', 409)

    // New nodes go to the end of their level.
    const last = await db.category.findFirst({
      where: { parentId: body.parentId ?? null },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    })

    const created = await db.category.create({
      data: {
        slug,
        name: body.name,
        parentId: body.parentId ?? null,
        icon: body.icon ?? null,
        sortOrder: (last?.sortOrder ?? 0) + 1,
      },
      select: { id: true, slug: true, name: true },
    })

    revalidateTag(CATEGORY_CACHE_TAG, 'max')

    void auditLog({
      adminId: admin.id,
      action: 'category.create',
      entityType: 'category',
      entityId: created.id,
      summary: `Created category "${created.name}"`,
    })

    return ok({ category: created }, { status: 201 })
  })
}

const patchSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().trim().min(2).max(60).optional(),
  icon: z.string().trim().max(40).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(9_999).optional(),
})

export async function PATCH(request: Request): Promise<NextResponse> {
  return mutation(async () => {
    const admin = await requireAdminRole('MODERATOR')
    const { categoryId, ...changes } = await parseBody(request, patchSchema)

    const before = await db.category.findUnique({
      where: { id: categoryId },
      select: { id: true, name: true, isActive: true },
    })
    if (!before) return fail('Category not found', 404)

    // The slug is a stable public identifier — renaming the label must not
    // break links or bookmarks, so the slug stays put.
    await db.category.update({ where: { id: categoryId }, data: changes })

    revalidateTag(CATEGORY_CACHE_TAG, 'max')

    void auditLog({
      adminId: admin.id,
      action: 'category.update',
      entityType: 'category',
      entityId: categoryId,
      summary: `Updated "${before.name}"`,
      metadata: { before: { isActive: before.isActive }, changes },
    })

    return ok({ updated: true })
  })
}

export async function DELETE(request: Request): Promise<NextResponse> {
  return mutation(async () => {
    const admin = await requireAdminRole()
    const { categoryId } = await parseBody(
      request,
      z.object({ categoryId: z.string().min(1) }),
    )

    const category = await db.category.findUnique({
      where: { id: categoryId },
      select: {
        name: true,
        _count: { select: { listings: true, children: true } },
      },
    })
    if (!category) return fail('Category not found', 404)

    // Deleting a category with listings would orphan them. Hiding is the
    // correct move there, and the error says so.
    if (category._count.listings > 0 || category._count.children > 0) {
      return fail(
        `That category still has ${category._count.listings} listings and ${category._count.children} subcategories. Hide it instead.`,
        409,
      )
    }

    await db.category.delete({ where: { id: categoryId } })

    revalidateTag(CATEGORY_CACHE_TAG, 'max')

    void auditLog({
      adminId: admin.id,
      action: 'category.delete',
      entityType: 'category',
      entityId: categoryId,
      summary: `Deleted "${category.name}"`,
    })

    return ok({ deleted: true })
  })
}
