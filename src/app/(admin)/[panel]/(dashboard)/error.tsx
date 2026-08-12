'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[AdminError]', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-danger-subtle)] text-[var(--color-danger)]">
        <svg
          aria-hidden="true"
          className="h-7 w-7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
      </div>

      <h2 className="mt-4 text-[18px] font-semibold text-[var(--color-ink)]">
        Something went wrong in the admin panel
      </h2>

      <p className="mt-1.5 max-w-md text-[13px] text-[var(--color-ink-muted)]">
        {error.message || 'An unexpected error occurred while loading this page.'}
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button onClick={() => reset()} variant="primary">
          Try again
        </Button>
        <Button
          onClick={() => {
            window.location.href = window.location.pathname
          }}
          variant="secondary"
        >
          Reload page
        </Button>
      </div>
    </div>
  )
}
