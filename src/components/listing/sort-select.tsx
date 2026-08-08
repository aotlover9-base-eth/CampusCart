'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { CheckIcon, ChevronDownIcon, SortIcon } from '@/components/ui/icons'

/**
 * Sort control.
 *
 * A custom menu rather than a native <select> so the trigger can stay
 * icon-and-label on mobile and the panel can match the app's surfaces. Keyboard
 * behaviour mirrors a listbox: Escape closes, Enter/Space selects, arrows move.
 */

export interface SortOption {
  value: string
  label: string
}

/** Mirrors `feedSortSchema` in lib/validation. */
export const SORT_OPTIONS: SortOption[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'price_low', label: 'Price: low to high' },
  { value: 'price_high', label: 'Price: high to low' },
  { value: 'distance', label: 'Nearest first' },
  { value: 'popular', label: 'Most viewed' },
]

export function SortSelect({
  value,
  onChange,
  options = SORT_OPTIONS,
}: {
  value: string
  onChange: (value: string) => void
  options?: SortOption[]
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const active = options.find((option) => option.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'flex h-9 items-center gap-1.5 rounded-[10px] border px-3 text-[13px] font-medium',
          'border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink)]',
          'transition-colors hover:border-[var(--color-line-strong)]',
        )}
      >
        <SortIcon className="h-3.5 w-3.5 text-[var(--color-ink-muted)]" />
        <span className="hidden sm:inline">{active?.label}</span>
        <span className="sm:hidden">Sort</span>
        <ChevronDownIcon
          className={cn(
            'h-3.5 w-3.5 text-[var(--color-ink-muted)] transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            aria-label="Sort listings"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'absolute right-0 top-[calc(100%+6px)] z-[var(--z-nav)] w-52 overflow-hidden rounded-[var(--radius-md)] p-1',
              'border border-[var(--color-line)] bg-[var(--color-surface-raised)] shadow-[var(--shadow-lg)]',
            )}
          >
            {options.map((option) => {
              const selected = option.value === value

              return (
                <li key={option.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(option.value)
                      setOpen(false)
                    }}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-[8px] px-2.5 py-2',
                      'text-left text-[13px] transition-colors hover:bg-[var(--color-surface-hover)]',
                      selected ? 'font-medium text-[var(--color-ink)]' : 'text-[var(--color-ink-muted)]',
                    )}
                  >
                    {option.label}
                    {selected && <CheckIcon className="h-3.5 w-3.5" />}
                  </button>
                </li>
              )
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
