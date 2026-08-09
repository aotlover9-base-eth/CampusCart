'use client'

import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'

/**
 * Six-box OTP entry.
 *
 * Handles the details that make code entry feel effortless: auto-advance,
 * backspace stepping back, paste filling every box, and `one-time-code`
 * autocomplete so iOS and Android offer the SMS code from the keyboard.
 */

interface OtpInputProps {
  length?: number
  value: string
  onChange: (value: string) => void
  onComplete?: (value: string) => void
  disabled?: boolean
  error?: string
  autoFocus?: boolean
}

export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled,
  error,
  autoFocus,
}: OtpInputProps) {
  const inputs = useRef<Array<HTMLInputElement | null>>([])
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)

  useEffect(() => {
    if (autoFocus) inputs.current[0]?.focus()
  }, [autoFocus])

  // Fire onComplete exactly once per full code.
  const completedRef = useRef(false)
  useEffect(() => {
    if (value.length === length && !completedRef.current) {
      completedRef.current = true
      onComplete?.(value)
    }
    if (value.length < length) completedRef.current = false
  }, [value, length, onComplete])

  const setDigit = useCallback(
    (index: number, digit: string) => {
      const next = value.split('')
      next[index] = digit
      onChange(next.join('').slice(0, length))
    },
    [value, onChange, length],
  )

  const handleChange = (index: number, raw: string) => {
    const digits = raw.replace(/\D/g, '')
    if (!digits) return

    // Typing over a filled box, or a keyboard autofill dumping the whole code.
    if (digits.length > 1) {
      onChange(digits.slice(0, length))
      inputs.current[Math.min(digits.length, length - 1)]?.focus()
      return
    }

    setDigit(index, digits)
    if (index < length - 1) inputs.current[index + 1]?.focus()
  }

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace') {
      event.preventDefault()
      if (value[index]) {
        setDigit(index, '')
      } else if (index > 0) {
        // Empty box - step back and clear the previous one.
        const next = value.split('')
        next[index - 1] = ''
        onChange(next.join(''))
        inputs.current[index - 1]?.focus()
      }
      return
    }

    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault()
      inputs.current[index - 1]?.focus()
    }
    if (event.key === 'ArrowRight' && index < length - 1) {
      event.preventDefault()
      inputs.current[index + 1]?.focus()
    }
  }

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault()
    const digits = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (!digits) return
    onChange(digits)
    inputs.current[Math.min(digits.length, length - 1)]?.focus()
  }

  return (
    <div className="w-full">
      <div className="flex gap-2 justify-center" role="group" aria-label="Verification code">
        {Array.from({ length }).map((_, index) => (
          <input
            key={index}
            ref={(node) => {
              inputs.current[index] = node
            }}
            type="text"
            inputMode="numeric"
            // Lets mobile keyboards surface the SMS code directly.
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            maxLength={length}
            value={value[index] ?? ''}
            disabled={disabled}
            aria-label={`Digit ${index + 1}`}
            aria-invalid={error ? true : undefined}
            onChange={(event) => handleChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={handlePaste}
            onFocus={(event) => {
              setFocusedIndex(index)
              event.target.select()
            }}
            onBlur={() => setFocusedIndex(null)}
            className={cn(
              'h-13 w-11 rounded-[12px] border text-center text-xl font-semibold tabular-nums',
              'bg-[var(--color-surface)] text-[var(--color-ink)] transition-all duration-150',
              'focus:outline-none disabled:opacity-50',
              focusedIndex === index
                ? 'border-[var(--color-ink)] ring-2 ring-[var(--color-line-strong)]'
                : 'border-[var(--color-line-strong)]',
              error && 'border-[var(--color-danger)]',
            )}
            style={{ height: '3.25rem' }}
          />
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-2.5 text-center text-[13px] text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </div>
  )
}
