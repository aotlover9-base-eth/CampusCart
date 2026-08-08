'use client'

import { useState } from 'react'
import { cn, initials } from '@/lib/utils'
import { VerifiedBadge } from '@/components/brand/illustrations'

/**
 * Avatar with a deterministic initials fallback.
 *
 * The fallback is derived from the name rather than random, so the same person
 * always renders identically across the feed, chat, and profile.
 */

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const SIZES: Record<AvatarSize, { box: string; text: string; badge: string }> = {
  xs: { box: 'h-6 w-6', text: 'text-[10px]', badge: 'h-2.5 w-2.5' },
  sm: { box: 'h-8 w-8', text: 'text-[11px]', badge: 'h-3 w-3' },
  md: { box: 'h-10 w-10', text: 'text-[13px]', badge: 'h-3.5 w-3.5' },
  lg: { box: 'h-14 w-14', text: 'text-base', badge: 'h-4 w-4' },
  xl: { box: 'h-24 w-24', text: 'text-2xl', badge: 'h-6 w-6' },
}

export interface AvatarProps {
  name: string
  src?: string | null
  size?: AvatarSize
  verified?: boolean
  online?: boolean
  className?: string
}

export function Avatar({
  name,
  src,
  size = 'md',
  verified,
  online,
  className,
}: AvatarProps) {
  const [failed, setFailed] = useState(false)
  const dimensions = SIZES[size]
  const showImage = Boolean(src) && !failed

  return (
    <span className={cn('relative inline-flex shrink-0', dimensions.box, className)}>
      {showImage ? (
        <img
          src={src ?? ''}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className={cn(
            'h-full w-full rounded-full object-cover',
            'ring-1 ring-[var(--color-line)]',
          )}
        />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            'flex h-full w-full items-center justify-center rounded-full font-semibold',
            'bg-[var(--color-surface-sunken)] text-[var(--color-ink-muted)]',
            'ring-1 ring-[var(--color-line)] select-none',
            dimensions.text,
          )}
        >
          {initials(name)}
        </span>
      )}

      {verified && (
        <VerifiedBadge
          className={cn('absolute -bottom-0.5 -right-0.5', dimensions.badge)}
          aria-label="VIT verified"
        />
      )}

      {online && !verified && (
        <span
          className={cn(
            'absolute bottom-0 right-0 rounded-full ring-2 ring-[var(--color-surface)]',
            'bg-[var(--color-success)]',
            size === 'xs' || size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5',
          )}
          aria-label="Online"
        />
      )}
    </span>
  )
}
