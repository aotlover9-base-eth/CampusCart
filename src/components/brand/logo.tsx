import type { SVGProps } from 'react'

/**
 * CampusCart brand marks.
 *
 * Pure geometry, no gradients or effects, so the mark stays crisp from a 16px
 * favicon to a 512px app icon. `currentColor` throughout means the logo inherits
 * theme colour automatically.
 *
 * The mark is a cart abstracted to two forms: a rounded container (the basket)
 * and a single dot (the wheel), with the handle implied by the open corner.
 */

export function LogoMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      {/* Handle - the open stroke leading into the basket */}
      <path
        d="M4 6h3.2a2 2 0 0 1 1.94 1.51L9.6 9.5"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Basket - a rounded trapezoid, the primary silhouette */}
      <path
        d="M9.6 9.5h16.2a1.6 1.6 0 0 1 1.56 1.96l-1.72 7.4a3.2 3.2 0 0 1-3.12 2.48H13.3a3.2 3.2 0 0 1-3.13-2.55L8.1 8.9"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Wheels */}
      <circle cx="13.4" cy="26" r="2.1" fill="currentColor" />
      <circle cx="23.4" cy="26" r="2.1" fill="currentColor" />
    </svg>
  )
}

/** Full lockup: mark plus wordmark. Used in the nav and on auth screens. */
export function LogoLockup({
  className,
  markClassName,
}: {
  className?: string
  markClassName?: string
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ''}`}>
      <LogoMark className={markClassName ?? 'h-7.5 w-7.5 sm:h-8 sm:w-8'} />
      <span className="text-[19px] font-bold tracking-[-0.03em] sm:text-[21px]">
        Campus<span className="text-brand-gradient">Cart</span>
      </span>
    </span>
  )
}
