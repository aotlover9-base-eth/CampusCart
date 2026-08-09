'use client'

import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { XIcon } from '@/components/ui/icons'

/**
 * Overlay surface: a bottom sheet on mobile, a centred dialog from `sm` up.
 *
 * One component for both because the content is identical and only the entrance
 * differs - a sheet rising from the bottom edge is the native-feeling gesture on
 * a phone, while a centred card is right on a desktop.
 *
 * Handles the three things every dialog needs and most get wrong: focus moves
 * into the panel on open and back to the trigger on close, Escape closes, and
 * the page behind cannot scroll.
 */

export interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  children: ReactNode
  /** Sticky action row pinned to the bottom of the panel. */
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const SIZES = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-2xl',
}

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreFocusTo = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    if (!open) return

    restoreFocusTo.current = document.activeElement as HTMLElement | null

    // Lock the page behind the overlay, compensating for the scrollbar so the
    // layout doesn't jump on desktop.
    const { body } = document
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    const previousOverflow = body.style.overflow
    const previousPadding = body.style.paddingRight
    body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`

    // Move focus into the panel once the entrance animation has begun.
    const focusTimer = window.setTimeout(() => {
      const target = panelRef.current?.querySelector<HTMLElement>(
        '[data-autofocus], button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      target?.focus()
    }, 60)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }

      if (event.key !== 'Tab' || !panelRef.current) return

      // Trap Tab inside the panel.
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null)

      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      window.clearTimeout(focusTimer)
      body.style.overflow = previousOverflow
      body.style.paddingRight = previousPadding
      restoreFocusTo.current?.focus?.()
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 z-[var(--z-sheet-backdrop)] bg-black/45 backdrop-blur-[2px]"
            aria-hidden="true"
          />

          <div className="fixed inset-0 z-[var(--z-sheet)] flex items-end justify-center sm:items-center sm:p-6">
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={title ? titleId : undefined}
              aria-describedby={description ? descriptionId : undefined}
              initial={{ opacity: 0, y: '4%', scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: '3%', scale: 0.99 }}
              transition={{ type: 'spring', stiffness: 420, damping: 36 }}
              className={cn(
                'flex max-h-[90vh] w-full flex-col overflow-hidden bg-[var(--color-surface-raised)]',
                'rounded-t-[var(--radius-2xl)] sm:rounded-[var(--radius-xl)]',
                'border-t border-[var(--color-line)] sm:border',
                'shadow-[var(--shadow-xl)]',
                SIZES[size],
              )}
            >
              {/* Drag affordance - visual only; Escape and the backdrop close it. */}
              <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden="true">
                <span className="h-1 w-9 rounded-full bg-[var(--color-line-strong)]" />
              </div>

              {(title || description) && (
                <header className="flex items-start gap-3 px-5 pb-3 pt-4">
                  <div className="min-w-0 flex-1">
                    {title && (
                      <h2
                        id={titleId}
                        className="text-[17px] font-semibold tracking-[-0.02em] text-[var(--color-ink)]"
                      >
                        {title}
                      </h2>
                    )}
                    {description && (
                      <p
                        id={descriptionId}
                        className="mt-1 text-[13px] leading-relaxed text-[var(--color-ink-muted)]"
                      >
                        {description}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className={cn(
                      'shrink-0 rounded-full p-1.5 text-[var(--color-ink-muted)] transition-colors',
                      'hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)]',
                    )}
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                </header>
              )}

              <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>

              {footer && (
                <footer
                  className={cn(
                    'border-t border-[var(--color-line)] bg-[var(--color-surface-raised)]',
                    'px-5 py-3.5 pb-[max(14px,env(safe-area-inset-bottom))] sm:pb-3.5',
                  )}
                >
                  {footer}
                </footer>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}

/**
 * Destructive-action confirmation. Separate from Sheet so the copy, tone, and
 * button order stay consistent everywhere something is deleted or blocked.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = true,
  loading = false,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  loading?: boolean
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title} description={description} size="sm">
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className={cn(
            'h-10 rounded-[10px] px-4 text-sm font-medium transition-colors',
            'border border-[var(--color-line-strong)] text-[var(--color-ink)]',
            'hover:bg-[var(--color-surface-hover)] disabled:opacity-50',
          )}
        >
          {cancelLabel}
        </button>

        <button
          type="button"
          data-autofocus
          onClick={onConfirm}
          disabled={loading}
          className={cn(
            'h-10 rounded-[10px] px-4 text-sm font-medium text-white transition-opacity',
            destructive ? 'bg-[var(--color-danger)]' : 'bg-[var(--color-ink)] text-[var(--color-ink-inverse)]',
            'hover:opacity-90 disabled:opacity-50',
          )}
        >
          {loading ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Sheet>
  )
}
