'use client'

import { forwardRef, useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/**
 * Text input and textarea.
 *
 * Errors are wired to the control with aria-describedby and aria-invalid, so
 * screen readers announce the message rather than just a red border.
 */

const fieldBase =
  'w-full bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-line-strong)] ' +
  'placeholder:text-[var(--color-ink-subtle)] transition-colors duration-150 ' +
  'hover:border-[var(--color-ink-subtle)] focus:border-[var(--color-ink)] focus:outline-none ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  prefix?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, error, hint, prefix, id, ...props },
  ref,
) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-[13px] font-medium text-[var(--color-ink)]"
        >
          {label}
        </label>
      )}

      <div className="relative flex items-center">
        {prefix && (
          <span className="pointer-events-none absolute left-3 text-sm text-[var(--color-ink-muted)]">
            {prefix}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            fieldBase,
            'h-11 rounded-[10px] px-3 text-[15px]',
            prefix && 'pl-11',
            error && 'border-[var(--color-danger)] focus:border-[var(--color-danger)]',
            className,
          )}
          {...props}
        />
      </div>

      {error ? (
        <p id={`${inputId}-error`} role="alert" className="mt-1.5 text-[13px] text-[var(--color-danger)]">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-1.5 text-[13px] text-[var(--color-ink-muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  )
})

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, label, error, hint, id, ...props },
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

      <textarea
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          fieldBase,
          'min-h-[110px] resize-y rounded-[12px] p-3 text-[15px] leading-relaxed',
          error && 'border-[var(--color-danger)] focus:border-[var(--color-danger)]',
          className,
        )}
        {...props}
      />

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
