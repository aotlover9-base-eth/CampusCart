'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api, queryString } from '@/lib/client/fetcher'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SearchIcon } from '@/components/ui/icons'

/**
 * Paginated admin list.
 *
 * Every admin section is the same shape — filter, fetch, page, act on a row —
 * so the fetching, cursor handling, debounced search, and refresh-after-action
 * live here once and each section supplies only its filters and row renderer.
 */

interface AdminListProps<T> {
  endpoint: string
  /** Response key holding the rows, e.g. `users` or `listings`. */
  dataKey: string
  filters?: Record<string, string | undefined>
  searchPlaceholder?: string
  onSearch?: (value: string) => void
  searchValue?: string
  toolbar?: React.ReactNode
  emptyMessage?: string
  renderRow: (item: T, refresh: () => void) => React.ReactNode
  /** Bumping this from a parent forces a reload. */
  refreshToken?: number
}

const DEBOUNCE_MS = 250

export function AdminList<T extends { id: string }>({
  endpoint,
  dataKey,
  filters,
  searchPlaceholder,
  onSearch,
  searchValue,
  toolbar,
  emptyMessage = 'Nothing here.',
  renderRow,
  refreshToken = 0,
}: AdminListProps<T>) {
  const [items, setItems] = useState<T[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const filterKey = JSON.stringify(filters ?? {})
  // Guards against a slow response for filters the admin has moved on from.
  const activeKey = useRef(filterKey)

  const load = useCallback(
    async (nextCursor: string | null, replace: boolean) => {
      const requestKey = filterKey
      setLoading(true)
      setError(null)

      try {
        const query = queryString({ ...filters, cursor: nextCursor ?? undefined })
        const data = await api<Record<string, unknown>>(`${endpoint}${query}`)

        if (activeKey.current !== requestKey) return

        const rows = (data[dataKey] ?? []) as T[]
        setItems((current) => (replace ? rows : [...current, ...rows]))
        setCursor((data.nextCursor as string | null) ?? null)
        setHasMore(Boolean(data.hasMore))
      } catch (caught) {
        if (activeKey.current !== requestKey) return
        setError(caught instanceof Error ? caught.message : 'Could not load')
      } finally {
        if (activeKey.current === requestKey) setLoading(false)
      }
    },
    [endpoint, dataKey, filterKey, filters],
  )

  // Debounced so typing in the search box fires one request, not one per key.
  useEffect(() => {
    activeKey.current = filterKey
    const timer = window.setTimeout(() => void load(null, true), DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
    // `load` is keyed off filterKey; refreshToken forces a manual reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, refreshToken])

  const refresh = useCallback(() => void load(null, true), [load])

  return (
    <div className="space-y-3">
      {(onSearch || toolbar) && (
        <div className="flex flex-wrap items-center gap-2">
          {onSearch && (
            <div className="relative min-w-[200px] flex-1">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-ink-subtle)]" />
              <input
                type="search"
                value={searchValue ?? ''}
                onChange={(event) => onSearch(event.target.value)}
                placeholder={searchPlaceholder ?? 'Search'}
                className={cn(
                  'h-9 w-full rounded-[var(--radius-sm)] border pl-9 pr-3 text-[13px]',
                  'border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[var(--color-ink)]',
                  'placeholder:text-[var(--color-ink-subtle)] focus:border-[var(--color-ink)] focus:outline-none',
                  '[&::-webkit-search-cancel-button]:appearance-none',
                )}
              />
            </div>
          )}
          {toolbar}
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-16 w-full rounded-[var(--radius-md)]" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-line)] p-6 text-center">
          <p className="mb-3 text-[13px] text-[var(--color-danger)]">{error}</p>
          <Button variant="secondary" size="sm" onClick={refresh}>
            Retry
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-[var(--radius-md)] border border-[var(--color-line)] p-8 text-center text-[13px] text-[var(--color-ink-subtle)]">
          {emptyMessage}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>{renderRow(item, refresh)}</li>
          ))}
        </ul>
      )}

      {hasMore && (
        <div className="pt-1 text-center">
          <Button
            variant="secondary"
            size="sm"
            loading={loading}
            onClick={() => cursor && void load(cursor, false)}
          >
            Load more
          </Button>
        </div>
      )}
    </div>
  )
}

/** Consistent row container for every admin list. */
export function AdminRow({
  children,
  tone = 'default',
}: {
  children: React.ReactNode
  tone?: 'default' | 'warning' | 'danger'
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border p-3',
        tone === 'warning'
          ? 'border-[var(--color-warning)]/35 bg-[var(--color-warning-soft)]'
          : tone === 'danger'
            ? 'border-[var(--color-danger)]/35 bg-[var(--color-danger-soft)]'
            : 'border-[var(--color-line)] bg-[var(--color-surface)]',
      )}
    >
      {children}
    </div>
  )
}

/** Small filter pill row shared by the admin sections. */
export function FilterTabs({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string }>
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={cn(
            'rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors',
            value === option.value
              ? 'bg-[var(--color-ink)] text-[var(--color-ink-inverse)]'
              : 'border border-[var(--color-line)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
