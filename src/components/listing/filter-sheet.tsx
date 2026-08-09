'use client'

import { useEffect, useState } from 'react'
import type { CategoryNode } from '@/lib/categories'
import { cn } from '@/lib/utils'
import {
  CONDITION_OPTIONS,
  HOSTEL_BLOCKS,
  PICKUP_AREA_OPTIONS,
  ROLE_OPTIONS,
  hostelBlockLabel,
} from '@/lib/constants'
import { Sheet } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import type { FeedFilters } from '@/components/listing/listing-feed'

/**
 * Filter panel.
 *
 * Edits a draft copy and only commits on Apply, so a half-built filter set never
 * triggers a refetch. Opening the sheet re-seeds the draft from whatever is
 * currently applied.
 */

export function FilterSheet({
  open,
  onClose,
  filters,
  onApply,
  categories,
  canUseDistance,
}: {
  open: boolean
  onClose: () => void
  filters: FeedFilters
  onApply: (next: FeedFilters) => void
  categories: CategoryNode[]
  /** Distance needs coordinates on the viewer's profile. */
  canUseDistance: boolean
}) {
  const [draft, setDraft] = useState<FeedFilters>(filters)

  useEffect(() => {
    if (open) setDraft(filters)
  }, [open, filters])

  function toggleInList(key: 'condition' | 'sellerRole', value: string) {
    setDraft((current) => {
      const list = current[key] ?? []
      const next = list.includes(value)
        ? list.filter((item) => item !== value)
        : [...list, value]
      return { ...current, [key]: next.length > 0 ? next : undefined }
    })
  }

  function reset() {
    // Keep the search term and sort - those belong to the page, not the panel.
    setDraft({ q: filters.q, sort: filters.sort })
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filters"
      size="md"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={reset}>
            Clear all
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              onApply(draft)
              onClose()
            }}
          >
            Show results
          </Button>
        </div>
      }
    >
      <div className="space-y-6 pt-1">
        <Group label="Category">
          <Select
            placeholder="Any category"
            value={draft.category ?? ''}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                category: event.target.value || undefined,
              }))
            }
          >
            {categories.map((node) => (
              <optgroup key={node.id} label={node.name}>
                <option value={node.slug}>All {node.name}</option>
                {node.children.map((child) => (
                  <option key={child.id} value={child.slug}>
                    {child.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Group>

        <Group label="Price">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              inputMode="numeric"
              prefix="₹"
              placeholder="Min"
              min={0}
              value={draft.minPrice ?? ''}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  minPrice: event.target.value ? Number(event.target.value) : undefined,
                }))
              }
            />
            <span className="text-[var(--color-ink-subtle)]">-</span>
            <Input
              type="number"
              inputMode="numeric"
              prefix="₹"
              placeholder="Max"
              min={0}
              value={draft.maxPrice ?? ''}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  maxPrice: event.target.value ? Number(event.target.value) : undefined,
                }))
              }
            />
          </div>

          <CheckRow
            checked={draft.freeOnly ?? false}
            onChange={(checked) =>
              setDraft((current) => ({
                ...current,
                freeOnly: checked || undefined,
                // A price range is meaningless once "free only" is on.
                ...(checked ? { minPrice: undefined, maxPrice: undefined } : {}),
              }))
            }
            label="Free items only"
          />

          <CheckRow
            checked={draft.negotiable ?? false}
            onChange={(checked) =>
              setDraft((current) => ({ ...current, negotiable: checked || undefined }))
            }
            label="Negotiable only"
          />
        </Group>

        <Group label="Condition">
          <div className="flex flex-wrap gap-2">
            {CONDITION_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                active={(draft.condition ?? []).includes(option.value)}
                onClick={() => toggleInList('condition', option.value)}
              >
                {option.label}
              </Chip>
            ))}
          </div>
        </Group>

        <Group label="Seller">
          <div className="flex flex-wrap gap-2">
            {ROLE_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                active={(draft.sellerRole ?? []).includes(option.value)}
                onClick={() => toggleInList('sellerRole', option.value)}
              >
                {option.label}
              </Chip>
            ))}
          </div>

          <CheckRow
            checked={draft.vitVerifiedOnly ?? false}
            onChange={(checked) =>
              setDraft((current) => ({ ...current, vitVerifiedOnly: checked || undefined }))
            }
            label="VIT-verified sellers only"
          />
        </Group>

        <Group label="Location">
          <div className="flex flex-wrap gap-2">
            {PICKUP_AREA_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                active={draft.pickupArea === option.value}
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    // Tapping the active chip clears it, so "either" needs no
                    // third option.
                    pickupArea:
                      current.pickupArea === option.value ? undefined : option.value,
                    // A block filter only makes sense on campus.
                    ...(option.value === 'OUTSIDE_CAMPUS' ? { hostelBlock: undefined } : {}),
                  }))
                }
              >
                {option.label}
              </Chip>
            ))}
          </div>

          <Select
            placeholder="Any hostel block"
            value={draft.hostelBlock ?? ''}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                hostelBlock: event.target.value || undefined,
              }))
            }
          >
            {HOSTEL_BLOCKS.map((block) => (
              <option key={block} value={block}>
                {hostelBlockLabel(block)}
              </option>
            ))}
          </Select>

          {canUseDistance && (
            <Select
              placeholder="Any distance"
              value={draft.radiusKm ?? ''}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  radiusKm: event.target.value ? Number(event.target.value) : undefined,
                }))
              }
            >
              {[1, 3, 5, 10, 25].map((km) => (
                <option key={km} value={km}>
                  Within {km} km
                </option>
              ))}
            </Select>
          )}
        </Group>
      </div>
    </Sheet>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <h3 className="text-[13px] font-semibold text-[var(--color-ink)]">{label}</h3>
      {children}
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors',
        active
          ? 'border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-ink-inverse)]'
          : 'border-[var(--color-line)] text-[var(--color-ink-muted)] hover:border-[var(--color-line-strong)] hover:text-[var(--color-ink)]',
      )}
    >
      {children}
    </button>
  )
}

function CheckRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-[var(--color-line-strong)] accent-[var(--color-ink)]"
      />
      <span className="text-[14px] text-[var(--color-ink)]">{label}</span>
    </label>
  )
}

/** Count of active constraints, for the badge on the Filters button. */
export function countActiveFilters(filters: FeedFilters): number {
  let count = 0
  if (filters.category) count += 1
  if (filters.minPrice != null || filters.maxPrice != null) count += 1
  if (filters.freeOnly) count += 1
  if (filters.negotiable) count += 1
  if (filters.condition?.length) count += 1
  if (filters.sellerRole?.length) count += 1
  if (filters.vitVerifiedOnly) count += 1
  if (filters.hostelBlock) count += 1
  if (filters.pickupArea) count += 1
  if (filters.radiusKm) count += 1
  return count
}
