import type { ReactNode } from 'react'

/**
 * Shared typography for the legal documents.
 *
 * Kept as small components rather than a global prose stylesheet so these pages
 * use the same tokens as the rest of the app and can't drift from it.
 */

export function LegalDocument({
  title,
  updated,
  summary,
  children,
}: {
  title: string
  /** Absolute date — "recently" is not useful in a legal document. */
  updated: string
  summary: string
  children: ReactNode
}) {
  return (
    <article>
      <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[var(--color-ink)] sm:text-[34px]">
        {title}
      </h1>
      <p className="mt-2 text-[13px] text-[var(--color-ink-subtle)]">
        Last updated {updated}
      </p>

      <p className="mt-5 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface-sunken)] p-4 text-[14px] leading-relaxed text-[var(--color-ink-muted)]">
        {summary}
      </p>

      <div className="mt-8 space-y-8">{children}</div>
    </article>
  )
}

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-[17px] font-semibold tracking-[-0.015em] text-[var(--color-ink)]">
        {heading}
      </h2>
      <div className="mt-2.5 space-y-3 text-[14.5px] leading-relaxed text-[var(--color-ink-muted)]">
        {children}
      </div>
    </section>
  )
}

export function List({ items }: { items: string[] }) {
  return (
    <ul className="ml-4 list-disc space-y-1.5 marker:text-[var(--color-ink-subtle)]">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}
