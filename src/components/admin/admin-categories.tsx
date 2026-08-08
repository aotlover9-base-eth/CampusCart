'use client'

import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/client/fetcher'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { CategoryIcon } from '@/components/brand/icons'

/**
 * Category management.
 *
 * Categories are hidden rather than deleted once they hold listings — the API
 * refuses a delete that would orphan rows, and the UI offers hide in its place.
 */

interface AdminCategory {
  id: string
  slug: string
  name: string
  icon: string | null
  parentId: string | null
  sortOrder: number
  isActive: boolean
  listingCount: number
  childCount: number
}

export function AdminCategories() {
  const toast = useToast()
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await api<{ categories: AdminCategory[] }>('/api/admin/categories')
      setCategories(data.categories)
    } catch {
      toast.error('Could not load categories.')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  async function create() {
    if (name.trim().length < 2) return
    setCreating(true)

    try {
      await api('/api/admin/categories', {
        method: 'POST',
        body: { name: name.trim(), ...(parentId ? { parentId } : {}) },
      })
      toast.success('Category created')
      setName('')
      setParentId('')
      void load()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not create that.')
    } finally {
      setCreating(false)
    }
  }

  async function toggleActive(category: AdminCategory) {
    setCategories((current) =>
      current.map((item) =>
        item.id === category.id ? { ...item, isActive: !item.isActive } : item,
      ),
    )

    try {
      await api('/api/admin/categories', {
        method: 'PATCH',
        body: { categoryId: category.id, isActive: !category.isActive },
      })
    } catch {
      setCategories((current) =>
        current.map((item) =>
          item.id === category.id ? { ...item, isActive: category.isActive } : item,
        ),
      )
      toast.error('Could not update that.')
    }
  }

  async function remove(category: AdminCategory) {
    try {
      await api('/api/admin/categories', {
        method: 'DELETE',
        body: { categoryId: category.id },
      })
      toast.success('Category deleted')
      void load()
    } catch (error) {
      // The API explains why a delete is refused; surface that verbatim.
      toast.error(error instanceof ApiError ? error.message : 'Could not delete that.')
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full rounded-[var(--radius-md)]" />
        ))}
      </div>
    )
  }

  const parents = categories.filter((item) => item.parentId === null)

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--color-ink)]">
          Categories
        </h1>
        <p className="mt-0.5 text-[13px] text-[var(--color-ink-muted)]">
          Hiding a category keeps its listings reachable by direct link but takes
          it out of browse and the compose form.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-2 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] p-3.5">
        <div className="min-w-[180px] flex-1">
          <Input
            label="New category"
            placeholder="Lab equipment"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="min-w-[160px]">
          <Select
            label="Parent"
            placeholder="Top level"
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
          >
            {parents.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parent.name}
              </option>
            ))}
          </Select>
        </div>
        <Button loading={creating} disabled={name.trim().length < 2} onClick={() => void create()}>
          Add
        </Button>
      </div>

      <ul className="space-y-1.5">
        {parents.map((parent) => {
          const children = categories.filter((item) => item.parentId === parent.id)

          return (
            <li key={parent.id}>
              <Row category={parent} onToggle={toggleActive} onRemove={remove} />
              {children.length > 0 && (
                <ul className="ml-6 mt-1.5 space-y-1.5 border-l border-[var(--color-line)] pl-3">
                  {children.map((child) => (
                    <li key={child.id}>
                      <Row category={child} onToggle={toggleActive} onRemove={remove} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Row({
  category,
  onToggle,
  onRemove,
}: {
  category: AdminCategory
  onToggle: (category: AdminCategory) => void
  onRemove: (category: AdminCategory) => void
}) {
  const removable = category.listingCount === 0 && category.childCount === 0

  return (
    <div className="flex items-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2">
      <CategoryIcon
        name={category.icon}
        className="h-4 w-4 shrink-0 text-[var(--color-ink-muted)]"
      />

      <div className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-[13.5px] text-[var(--color-ink)]">
            {category.name}
          </span>
          {!category.isActive && <Badge tone="neutral">hidden</Badge>}
        </span>
        <span className="text-[11.5px] text-[var(--color-ink-subtle)]">
          /{category.slug} · {category.listingCount} listings
        </span>
      </div>

      <Button size="sm" variant="ghost" onClick={() => onToggle(category)}>
        {category.isActive ? 'Hide' : 'Show'}
      </Button>

      {removable && (
        <Button
          size="sm"
          variant="ghost"
          className="text-[var(--color-danger)]"
          onClick={() => onRemove(category)}
        >
          Delete
        </Button>
      )}
    </div>
  )
}
