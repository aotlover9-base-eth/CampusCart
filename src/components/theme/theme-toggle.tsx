'use client'

import { motion } from 'framer-motion'
import { useTheme } from './theme-provider'

/**
 * Theme toggle - a sliding knob with crossfading sun/moon glyphs.
 *
 * Announced as a switch to assistive tech, with the resolved theme in the label
 * so screen-reader users know the current state rather than just the action.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolved, toggle } = useTheme()
  const isDark = resolved === 'dark'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={`Dark mode ${isDark ? 'on' : 'off'}`}
      onClick={toggle}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors focus-ring ${className ?? ''}`}
      style={{
        borderColor: 'var(--color-line-strong)',
        background: isDark ? 'var(--color-surface-raised)' : 'var(--color-surface-sunken)',
      }}
    >
      <motion.span
        className="absolute flex h-5 w-5 items-center justify-center rounded-full"
        style={{ background: 'var(--color-ink)', color: 'var(--color-surface)' }}
        animate={{ x: isDark ? 24 : 3 }}
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
      >
        {isDark ? <MoonGlyph /> : <SunGlyph />}
      </motion.span>
    </button>
  )
}

function SunGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" strokeLinecap="round" />
    </svg>
  )
}

function MoonGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path
        d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
