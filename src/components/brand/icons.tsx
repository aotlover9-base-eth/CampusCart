import type { SVGProps } from 'react'

/**
 * Category icons - geometric, minimal, and 20×20 on a 24×24 viewBox for
 * consistent optical weight across the category picker.
 */

export function IconElectronics(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="3" y="5" width="18" height="12" rx="2" strokeLinejoin="round" />
      <path d="M8 21h8M12 17v4" strokeLinecap="round" />
    </svg>
  )
}

export function IconBooks(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M4 19V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14M4 19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2M4 19a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2M9 7h6M9 11h6" strokeLinecap="round" />
    </svg>
  )
}

export function IconFurniture(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M4 11v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M4 11H2v-1a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4v1h-2M4 11h16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconCycle(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="5.5" cy="17.5" r="3.5" />
      <circle cx="18.5" cy="17.5" r="3.5" />
      <path d="M15 7v4h-4M9 11L5.5 14M15 7h-3a1 1 0 0 0-.83.45L9 11" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconFashion(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M16 3h4v3M8 3H4v3M12 3v5M6 6l1.5 14h9L18 6H6Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconSports(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a16.5 16.5 0 0 0 0 18M12 3a16.5 16.5 0 0 1 0 18M3 12h18" />
    </svg>
  )
}

export function IconMusic(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M9 17H6a2 2 0 1 0 0 4h3v-4ZM9 5v12M18 14h-3a2 2 0 1 0 0 4h3v-4ZM18 5v9M9 5l9-2v2l-9 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconTickets(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18M8 5v14M16 5v14" />
    </svg>
  )
}

export function IconServices(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 8v4l2.5 1.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" strokeLinecap="round" />
    </svg>
  )
}

export function IconLostFound(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35M11 8v3M11 14h.01" strokeLinecap="round" />
    </svg>
  )
}

export function IconOther(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="6" cy="12" r="2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="2" fill="currentColor" stroke="none" />
    </svg>
  )
}

const icons = {
  electronics: IconElectronics,
  books: IconBooks,
  furniture: IconFurniture,
  cycle: IconCycle,
  fashion: IconFashion,
  sports: IconSports,
  music: IconMusic,
  tickets: IconTickets,
  services: IconServices,
  lost_found: IconLostFound,
  other: IconOther,
}

export type CategoryIconName = keyof typeof icons

/**
 * Resolve a category's icon key to its glyph.
 *
 * The key comes from the database as a free-form nullable string, so an unknown
 * or missing value falls back to the neutral "other" mark rather than rendering
 * nothing. `name` is omitted from the passthrough props because SVG has its own
 * `name` attribute, and the intersection would otherwise narrow away `null`.
 */
export function CategoryIcon({
  name,
  ...props
}: { name: string | null | undefined } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  const Component = (name && icons[name as CategoryIconName]) || IconOther
  return <Component {...props} />
}
