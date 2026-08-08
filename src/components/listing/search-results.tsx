'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import type { CategoryNode } from '@/lib/categories'
import { api, queryString } from '@/lib/client/fetcher'
import { cn } from '@/lib/utils'
import { CategoryIcon } from '@/components/brand/icons'
import { SearchIcon, SlidersIcon, XIcon } from '@/components/ui/icons'
import { CountBadge } from '@/components/ui/badge'
import { ListingFeed, type FeedFilters } from '@/components/listing/listing-feed'
import { SORT_OPTIONS, SortSelect } from '@/components/listing/sort-select'
import { FilterSheet, countActiveFilters } from '@/components/listing/filter-sheet'

/**
 * Search surface.
 *
 * The typed value and the committed query are separate pieces of state: the
 * input updates on every keystroke (for autocomplete) while the feed only
 * refetches once the user pauses, presses Enter, or picks a suggestion.
 */

interface Suggestion {
  kind: 'category' | 'listing'
  text: string
  slug?: string
  id?: string
  icon?: string | null
}

const DEBOUNCE_MS = 220

export function SearchResults({
  categories,
  initialQuery,
  initialCategory,
  initialSort,
  viewerCoords,
}: {
  categories: CategoryNode[]
  initialQuery: string
  initialCategory?: string
  initialSort: string
  viewerCoords: { lat: number; lng: number } | null
}) {
  const router = useRouter()

  const [input, setInput] = useState(initialQuery)
  const [query, setQuery] = useState(initialQuery)
  const [sort, setSort] = useState(initialSort)
  const [filters, setFilters] = useState<FeedFilters>({
    category: initialCategory,
  })

  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)

  // Commit the typed value after a pause. Cleared on every keystroke, so a fast
  // typist produces exactly one request.
  useEffect(() => {
    if (input === query) return

    const timer = window.setTimeout(() => setQuery(input.trim()), DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [input, query])

  // Autocomplete. Fires independently of the committed query so the dropdown
  // stays responsive while results below are still settling.
  useEffect(() => {
    const term = input.trim()
    if (term.length < 2) {
      setSuggestions([])
      return
    }

    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        const result = await api<{ suggestions: Suggestion[] }>(
          `/api/search/suggest${queryString({ q: term })}`,
        )
        if (!cancelled) setSuggestions(result.suggestions)
      } catch {
        if (!cancelled) setSuggestions([])
      }
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [input])

  // Keep the URL in step so results are shareable and survive a refresh.
  useEffect(() => {
    const next = queryString({
      ...(query ? { q: query } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(sort !== 'relevance' ? { sort } : {}),
    })
    window.history.replaceState(null, '', `/search${next}`)
  }, [query, filters.category, sort])

  useEffect(() => {
    if (!suggestOpen) return

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setSuggestOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [suggestOpen])

  const commit = useCallback((value: string) => {
    setInput(value)
    setQuery(value.trim())
    setSuggestOpen(false)
  }, [])

  /**
   * Relevance ranking only exists on /api/search, and it needs a term. Without
   * one, fall back to the ordinary feed sorted by recency.
   */
  const hasTerm = query.trim().length >= 2
  const effectiveSort = sort === 'relevance' ? (hasTerm ? 'relevance' : 'newest') : sort

  const feedFilters = useMemo<FeedFilters>(
    () => ({
      ...filters,
      ...(hasTerm ? { q: query } : {}),
      sort: effectiveSort === 'relevance' ? undefined : effectiveSort,
      ...(effectiveSort === 'distance' && viewerCoords
        ? { lat: viewerCoords.lat, lng: viewerCoords.lng }
        : {}),
    }),
    [filters, hasTerm, query, effectiveSort, viewerCoords],
  )

  const sortOptions = useMemo(() => {
    const base = SORT_OPTIONS.filter(
      (option) => option.value !== 'distance' || viewerCoords !== null,
    )
    // Relevance is only meaningful with a search term.
    return hasTerm ? [{ value: 'relevance', label: 'Best match' }, ...base] : base
  }, [hasTerm, viewerCoords])

  const activeCount = countActiveFilters(filters)

  return (
    <div className="mx-auto max-w-[var(--container-max)] px-4 py-5 sm:py-7">
      <div ref={containerRef} className="relative">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-subtle)]" />
            <input
              type="search"
              inputMode="search"
              autoFocus={!initialQuery}
              value={input}
              placeholder="Search cycles, calculators, hostel gear…"
              aria-label="Search listings"
              onChange={(event) => {
                setInput(event.target.value)
                setSuggestOpen(true)
              }}
              onFocus={() => setSuggestOpen(true)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commit(input)
                }
                if (event.key === 'Escape') setSuggestOpen(false)
              }}
              className={cn(
                'h-11 w-full rounded-[12px] border pl-10 pr-9 text-[15px]',
                'border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[var(--color-ink)]',
                'placeholder:text-[var(--color-ink-subtle)] transition-colors',
                'focus:border-[var(--color-ink)] focus:outline-none',
                // Suppress the browser's own clear affordance; ours is below.
                '[&::-webkit-search-cancel-button]:appearance-none',
              )}
            />
            {input && (
              <button
                type="button"
                onClick={() => commit('')}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--color-ink-subtle)] transition-colors hover:text-[var(--color-ink)]"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className={cn(
              'flex h-11 shrink-0 items-center gap-2 rounded-[12px] border px-3.5 text-[13px] font-medium transition-colors',
              activeCount > 0
                ? 'border-[var(--color-ink)] text-[var(--color-ink)]'
                : 'border-[var(--color-line-strong)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]',
            )}
          >
            <SlidersIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Filters</span>
            {activeCount > 0 && <CountBadge count={activeCount} />}
          </button>
        </div>

        <AnimatePresence>
          {suggestOpen && suggestions.length > 0 && (
            <motion.ul
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.14 }}
              className={cn(
                'absolute inset-x-0 top-[calc(100%+6px)] z-[var(--z-nav)] overflow-hidden rounded-[var(--radius-md)] p-1',
                'border border-[var(--color-line)] bg-[var(--color-surface-raised)] shadow-[var(--shadow-lg)]',
              )}
            >
              {suggestions.map((item, index) => (
                <li key={`${item.kind}-${item.slug ?? item.id ?? index}`}>
                  <button
                    type="button"
                    onClick={() => {
                      if (item.kind === 'category' && item.slug) {
                        setFilters((current) => ({ ...current, category: item.slug }))
                        commit('')
                      } else if (item.kind === 'listing' && item.id) {
                        router.push(`/listing/${item.id}`)
                      } else {
                        commit(item.text)
                      }
                    }}
                    className="flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left transition-colors hover:bg-[var(--color-surface-hover)]"
                  >
                    {item.kind === 'category' ? (
                      <CategoryIcon
                        name={item.icon}
                        className="h-4 w-4 shrink-0 text-[var(--color-ink-muted)]"
                      />
                    ) : (
                      <SearchIcon className="h-4 w-4 shrink-0 text-[var(--color-ink-subtle)]" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-[var(--color-ink)]">
                      {item.text}
                    </span>
                    {item.kind === 'category' && (
                      <span className="shrink-0 text-[11px] text-[var(--color-ink-subtle)]">
                        Category
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>

      <div className="mb-4 mt-5 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-[13px] text-[var(--color-ink-muted)]">
          {hasTerm ? `Results for "${query}"` : 'All listings'}
        </p>
        <SortSelect value={effectiveSort} onChange={setSort} options={sortOptions} />
      </div>

      <ListingFeed
        // Remount on a term change so ranked and unranked result sets never mix.
        key={hasTerm ? 'search' : 'browse'}
        endpoint={hasTerm ? '/api/search' : '/api/listings'}
        filters={feedFilters}
        emptyTitle={hasTerm ? `Nothing matches "${query}"` : 'No listings yet'}
        emptyDescription={
          hasTerm
            ? 'Try fewer words, or clear a filter or two.'
            : 'Check back soon, or list something yourself.'
        }
      />

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onApply={setFilters}
        categories={categories}
        canUseDistance={viewerCoords !== null}
      />
    </div>
  )
}
