import { unstable_cache } from 'next/cache'
import { db } from './db'

/**
 * Category tree loading.
 *
 * Shared by /api/categories and by any server component that needs categories
 * for a filter panel or the compose form, so the tree is built one way only.
 */

export interface CategoryChild {
  id: string
  name: string
  slug: string
  icon: string | null
  listingCount: number
}

export interface CategoryNode extends CategoryChild {
  allowsCustomLabel: boolean
  children: CategoryChild[]
}

/** Cache key for the tree. `revalidateTag` this after any admin edit. */
export const CATEGORY_CACHE_TAG = 'categories'

/**
 * Active categories as a two-level tree, each with a live count of active
 * listings. A parent's count includes everything filed under its children, so
 * "Electronics" reflects the whole section rather than only directly-filed items.
 */
export const listCategories = unstable_cache(
  loadCategoryTree,
  ['category-tree'],
  // Cached at the data layer rather than via a route-level `revalidate`, which
  // would make Next prerender /api/categories at build time - and that needs a
  // live database, breaking Docker and CI builds.
  { revalidate: 300, tags: [CATEGORY_CACHE_TAG] },
)

async function loadCategoryTree(): Promise<CategoryNode[]> {
  const rows = await db.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      slug: true,
      icon: true,
      parentId: true,
      allowsCustomLabel: true,
      _count: {
        select: {
          listings: { where: { status: 'ACTIVE', deletedAt: null } },
        },
      },
    },
  })

  const byId = new Map<string, CategoryNode>()

  for (const row of rows) {
    if (row.parentId) continue
    byId.set(row.id, {
      id: row.id,
      name: row.name,
      slug: row.slug,
      icon: row.icon,
      allowsCustomLabel: row.allowsCustomLabel,
      listingCount: row._count.listings,
      children: [],
    })
  }

  for (const row of rows) {
    if (!row.parentId) continue
    const parent = byId.get(row.parentId)
    if (!parent) continue

    parent.children.push({
      id: row.id,
      name: row.name,
      slug: row.slug,
      icon: row.icon,
      listingCount: row._count.listings,
    })
    parent.listingCount += row._count.listings
  }

  return [...byId.values()]
}

/** Resolves a slug to its category id, accepting either a parent or a child. */
export async function resolveCategorySlug(slug: string): Promise<string | null> {
  const category = await db.category.findUnique({
    where: { slug },
    select: { id: true, isActive: true },
  })
  return category?.isActive ? category.id : null
}
