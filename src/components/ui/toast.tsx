'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { CheckIcon, WarningIcon, XIcon } from '@/components/ui/icons'

/**
 * Toasts for the outcome of a mutation — the only global feedback channel.
 *
 * Rendered bottom-centre on mobile (above the tab bar) and bottom-right on
 * desktop. Auto-dismiss timers are tracked per toast so an early manual dismiss
 * doesn't leave a stray timeout behind.
 */

type ToastTone = 'success' | 'error' | 'info'

interface Toast {
  id: number
  tone: ToastTone
  message: string
  action?: { label: string; onClick: () => void }
}

interface ToastContextValue {
  toast: (message: string, options?: { tone?: ToastTone; action?: Toast['action'] }) => void
  success: (message: string) => void
  error: (message: string) => void
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const DURATION_MS = 4200

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((current) => current.filter((item) => item.id !== id))
  }, [])

  const toast = useCallback<ToastContextValue['toast']>(
    (message, options) => {
      const id = nextId.current++
      const entry: Toast = { id, message, tone: options?.tone ?? 'info', action: options?.action }

      // Cap the stack so a burst of failures can't cover the screen.
      setToasts((current) => [...current.slice(-2), entry])
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DURATION_MS),
      )
    },
    [dismiss],
  )

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      dismiss,
      success: (message) => toast(message, { tone: 'success' }),
      error: (message) => toast(message, { tone: 'error' }),
    }),
    [toast, dismiss],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        className={cn(
          'pointer-events-none fixed z-[var(--z-toast)] flex flex-col gap-2',
          'bottom-[calc(var(--nav-height-mobile)+16px)] left-1/2 w-[calc(100%-32px)] max-w-sm -translate-x-1/2',
          'sm:bottom-6 sm:left-auto sm:right-6 sm:translate-x-0',
        )}
      >
        <AnimatePresence initial={false}>
          {toasts.map((item) => (
            <ToastRow key={item.id} toast={item} onDismiss={dismiss} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      // Errors get assertive so they interrupt a screen reader mid-flow.
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto flex items-center gap-2.5 rounded-[var(--radius-md)] px-3.5 py-3',
        'border border-[var(--color-line)] bg-[var(--color-surface-raised)]',
        'shadow-[var(--shadow-lg)]',
      )}
    >
      <ToastGlyph tone={toast.tone} />
      <p className="min-w-0 flex-1 text-[13px] leading-snug text-[var(--color-ink)]">
        {toast.message}
      </p>

      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick()
            onDismiss(toast.id)
          }}
          className="shrink-0 text-[13px] font-semibold text-[var(--color-accent)] hover:underline"
        >
          {toast.action.label}
        </button>
      )}

      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
        className={cn(
          'shrink-0 rounded-full p-1 text-[var(--color-ink-subtle)]',
          'transition-colors hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)]',
        )}
      >
        <XIcon className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  )
}

function ToastGlyph({ tone }: { tone: ToastTone }) {
  if (tone === 'success') {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-success)]">
        <CheckIcon className="h-3 w-3 text-white" />
      </span>
    )
  }

  if (tone === 'error') {
    return <WarningIcon className="h-5 w-5 shrink-0 text-[var(--color-danger)]" />
  }

  return <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-accent)]" />
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside <ToastProvider>')
  return context
}
