import type { SVGProps } from 'react'

/**
 * Larger brand illustrations — auth screens and media fallbacks.
 *
 * These read theme tokens rather than hard-coded hex, so the same file works in
 * both themes. Geometry only: no gradients, no raster, nothing that needs a
 * second network request.
 */

/**
 * Login art: a campus exchange abstracted to two stacked listing cards passing
 * between hands. Deliberately quiet — it sits beside the form, not over it.
 */
export function AuthIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 320 320"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      {/* Hairline grid, echoing the OG card */}
      <g stroke="var(--color-line)" strokeWidth="1" opacity="0.7">
        <path d="M0 80h320M0 160h320M0 240h320" />
        <path d="M80 0v320M160 0v320M240 0v320" />
      </g>

      {/* Back card, offset and dimmed for depth */}
      <rect
        x="72"
        y="58"
        width="150"
        height="110"
        rx="14"
        fill="var(--color-surface-sunken)"
        stroke="var(--color-line-strong)"
        strokeWidth="2"
        opacity="0.65"
      />

      {/* Front card */}
      <rect
        x="96"
        y="92"
        width="150"
        height="110"
        rx="14"
        fill="var(--color-surface)"
        stroke="var(--color-line-strong)"
        strokeWidth="2.5"
      />
      {/* Its image well and text lines */}
      <rect x="110" y="106" width="122" height="52" rx="8" fill="var(--color-surface-sunken)" />
      <path
        d="M110 176h74M110 190h48"
        stroke="var(--color-line-strong)"
        strokeWidth="3"
        strokeLinecap="round"
      />

      {/* Price chip on the front card */}
      <rect x="196" y="168" width="36" height="18" rx="9" fill="var(--color-ink)" />

      {/* Exchange arrows below, closing the loop between two students */}
      <path
        d="M104 244c22-16 50-16 72 0"
        stroke="var(--color-ink-subtle)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M170 236l8 8-9 7"
        stroke="var(--color-ink-subtle)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M216 268c-22 16-50 16-72 0"
        stroke="var(--color-ink-subtle)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M150 276l-8-8 9-7"
        stroke="var(--color-ink-subtle)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <circle cx="86" cy="256" r="12" fill="var(--color-surface-sunken)" stroke="var(--color-line-strong)" strokeWidth="2" />
      <circle cx="234" cy="256" r="12" fill="var(--color-surface-sunken)" stroke="var(--color-line-strong)" strokeWidth="2" />
    </svg>
  )
}

/**
 * Shown in place of a listing image when a seller posts without media, and as
 * the fallback if an image 404s.
 */
export function ListingPlaceholder(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <rect width="200" height="200" fill="var(--color-surface-sunken)" />
      <g
        transform="translate(72 68) scale(2.2)"
        stroke="var(--color-ink-subtle)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.55"
      >
        <path d="M4 6h3.2a2 2 0 0 1 1.94 1.51L9.6 9.5" />
        <path d="M9.6 9.5h16.2a1.6 1.6 0 0 1 1.56 1.96l-1.72 7.4a3.2 3.2 0 0 1-3.12 2.48H13.3a3.2 3.2 0 0 1-3.13-2.55L8.1 8.9" />
      </g>
      <circle cx="101" cy="125" r="4.6" fill="var(--color-ink-subtle)" opacity="0.55" />
      <circle cx="123" cy="125" r="4.6" fill="var(--color-ink-subtle)" opacity="0.55" />
    </svg>
  )
}

/** Avatar fallback ring — pairs with the `initials()` helper. */
export function AvatarRing(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" {...props}>
      <circle cx="20" cy="20" r="19" stroke="var(--color-line-strong)" strokeWidth="1.5" />
    </svg>
  )
}

/** The VIT-verified tick, used next to names across the app. */
export function VerifiedBadge(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <path
        d="M8 1l1.9 1.4 2.3-.2.7 2.2 1.9 1.3-.8 2.2.8 2.2-1.9 1.3-.7 2.2-2.3-.2L8 15l-1.9-1.4-2.3.2-.7-2.2L1.2 10.3 2 8.1l-.8-2.2 1.9-1.3.7-2.2 2.3.2L8 1z"
        fill="var(--color-accent)"
      />
      <path
        d="M5.4 8.1l1.8 1.8 3.4-3.6"
        stroke="var(--color-accent-ink)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
