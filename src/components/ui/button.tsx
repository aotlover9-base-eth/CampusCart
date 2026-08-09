'use client'

import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

/**
 * Button primitive.
 *
 * Variants map to the monochrome palette - `primary` is solid ink (black in
 * light mode, white in dark), which keeps the UI colour-free by default.
 */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'
type Size = 'sm' | 'md' | 'lg' | 'icon'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  fullWidth?: boolean
}

const base =
  'relative inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap ' +
  'transition-colors duration-150 select-none disabled:pointer-events-none disabled:opacity-45'

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] rounded-[8px]',
  md: 'h-10 px-4 text-sm rounded-[10px]',
  lg: 'h-12 px-6 text-[15px] rounded-[12px]',
  icon: 'h-9 w-9 rounded-[10px]',
}

const variants: Record<Variant, string> = {
  primary:
    'bg-[var(--color-ink)] text-[var(--color-ink-inverse)] hover:opacity-90 active:opacity-80',
  secondary:
    'bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-line-strong)] ' +
    'hover:bg-[var(--color-surface-hover)]',
  ghost: 'text-[var(--color-ink)] hover:bg-[var(--color-surface-hover)]',
  danger: 'bg-[var(--color-danger)] text-white hover:opacity-90 active:opacity-80',
  accent: 'bg-[var(--color-accent)] text-[var(--color-accent-ink)] hover:bg-[var(--color-accent-hover)]',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, fullWidth, children, disabled, ...props },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      // A small press-scale reads as tactile without feeling bouncy.
      whileTap={disabled || loading ? undefined : { scale: 0.975 }}
      transition={{ type: 'spring', stiffness: 600, damping: 30 }}
      className={cn(base, sizes[size], variants[variant], fullWidth && 'w-full', className)}
      disabled={disabled || loading}
      {...(props as React.ComponentProps<typeof motion.button>)}
    >
      {loading && <Spinner />}
      <span className={cn('inline-flex items-center justify-center gap-1.5', loading && 'opacity-0')}>{children}</span>
    </motion.button>
  )
})

function Spinner() {
  return (
    <svg
      className="absolute h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
