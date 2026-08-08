'use client'

import { forwardRef, useId, type SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDownIcon } from '@/components/ui/icons'

/**
 * Native select, styled to match Input.
 *
 * Deliberately native rather than a custom listbox: on mobile this opens the OS
 * picker, which is faster to operate and accessible for free.
 */

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  hint?: string
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, label, error, hint, placeholder, id, children, ...props },
  ref,
) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={fieldId}
          className="mb-1.5 block text-[13px] font-medium text-[var(--color-ink)]"
        >
          {label}
        </label>
      )}

      <div className="relative">
        <select
          ref={ref}
          id={fieldId}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={cn(
            'h-11 w-full appearance-none rounded-[10px] border pl-3 pr-9 text-sm',
            'bg-[var(--color-surface)] text-[var(--color-ink)]',
            'border-[var(--color-line-strong)] transition-colors duration-150',
            'focus:border-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--color-line-strong)]',
            'disabled:opacity-50',
            error && 'border-[var(--color-danger)] focus:border-[var(--color-danger)]',
            className,
          )}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {children}
        </select>

        <ChevronDownIcon
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-subtle)]"
        />
      </div>

      {error ? (
        <p id={`${fieldId}-error`} role="alert" className="mt-1.5 text-[13px] text-[var(--color-danger)]">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="mt-1.5 text-[13px] text-[var(--color-ink-muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  )
})
