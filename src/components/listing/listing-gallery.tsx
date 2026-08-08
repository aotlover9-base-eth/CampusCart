'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlayIcon,
  VideoIcon,
  XIcon,
} from '@/components/ui/icons'
import { MediaFallback } from './listing-media'

/**
 * Listing gallery with a fullscreen lightbox.
 *
 * Videos here are click-to-play with controls, unlike the silent autoplay in
 * the feed: on a detail page the user has already chosen this listing, so
 * hijacking their audio is worse than asking for one tap.
 */

export interface GalleryItem {
  id: string
  kind: 'IMAGE' | 'VIDEO'
  url: string
  thumbnailUrl: string
  blurDataUrl?: string | null
  width?: number | null
  height?: number | null
  altText?: string | null
}

export function ListingGallery({
  media,
  title,
}: {
  media: GalleryItem[]
  title: string
}) {
  const [index, setIndex] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  const count = media.length
  const active = media[index]

  const go = useCallback(
    (delta: number) => {
      // Wrap around so the arrows never dead-end.
      setIndex((current) => (current + delta + count) % count)
    },
    [count],
  )

  useEffect(() => {
    if (!lightboxOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightboxOpen(false)
      if (event.key === 'ArrowLeft') go(-1)
      if (event.key === 'ArrowRight') go(1)
    }

    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [lightboxOpen, go])

  if (count === 0) {
    return (
      <MediaFallback className="aspect-[4/3] w-full rounded-[var(--radius-lg)]" />
    )
  }

  return (
    <>
      <div className="space-y-3">
        <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface-sunken)]">
          {active?.kind === 'VIDEO' ? (
            <video
              key={active.id}
              src={active.url}
              poster={active.thumbnailUrl}
              controls
              playsInline
              preload="metadata"
              className="h-full w-full object-contain bg-black"
            />
          ) : active ? (
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              className="group block h-full w-full cursor-zoom-in"
              aria-label="Open image full screen"
            >
              <Image
                src={active.url}
                alt={active.altText ?? title}
                fill
                sizes="(max-width: 1024px) 100vw, 720px"
                priority
                placeholder={active.blurDataUrl ? 'blur' : 'empty'}
                blurDataURL={active.blurDataUrl ?? undefined}
                className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
              />
            </button>
          ) : null}

          {count > 1 && (
            <>
              <GalleryArrow side="left" onClick={() => go(-1)} />
              <GalleryArrow side="right" onClick={() => go(1)} />
              <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-[12px] font-medium text-white backdrop-blur-sm">
                {index + 1} / {count}
              </span>
            </>
          )}
        </div>

        {count > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {media.map((item, itemIndex) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setIndex(itemIndex)}
                aria-label={`View media ${itemIndex + 1}`}
                aria-current={itemIndex === index}
                className={cn(
                  'relative h-16 w-16 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border-2 transition-colors',
                  itemIndex === index
                    ? 'border-[var(--color-ink)]'
                    : 'border-transparent opacity-65 hover:opacity-100',
                )}
              >
                <Image
                  src={item.thumbnailUrl}
                  alt=""
                  fill
                  sizes="64px"
                  className="object-cover"
                />
                {item.kind === 'VIDEO' && (
                  <span className="absolute inset-0 grid place-items-center bg-black/35">
                    <VideoIcon className="h-4 w-4 text-white" />
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {lightboxOpen && active && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`${title} — full screen image`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[var(--z-lightbox)] flex items-center justify-center bg-black/92"
            onClick={() => setLightboxOpen(false)}
          >
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              aria-label="Close"
              className="absolute right-4 top-4 rounded-full bg-white/10 p-2.5 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
            >
              <XIcon className="h-5 w-5" />
            </button>

            <motion.img
              key={active.id}
              src={active.url}
              alt={active.altText ?? title}
              initial={{ scale: 0.97, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              // Stop the backdrop handler so clicking the photo doesn't close it.
              onClick={(event) => event.stopPropagation()}
              className="max-h-[90vh] max-w-[92vw] object-contain"
            />

            {count > 1 && (
              <>
                <GalleryArrow
                  side="left"
                  onClick={(event) => {
                    event.stopPropagation()
                    go(-1)
                  }}
                  variant="lightbox"
                />
                <GalleryArrow
                  side="right"
                  onClick={(event) => {
                    event.stopPropagation()
                    go(1)
                  }}
                  variant="lightbox"
                />
                <span className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1.5 text-[13px] text-white backdrop-blur-sm">
                  {index + 1} / {count}
                </span>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function GalleryArrow({
  side,
  onClick,
  variant = 'inline',
}: {
  side: 'left' | 'right'
  onClick: (event: React.MouseEvent) => void
  variant?: 'inline' | 'lightbox'
}) {
  const Icon = side === 'left' ? ChevronLeftIcon : ChevronRightIcon

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Previous' : 'Next'}
      className={cn(
        'absolute top-1/2 -translate-y-1/2 rounded-full backdrop-blur-sm transition-colors',
        side === 'left' ? 'left-3' : 'right-3',
        variant === 'lightbox'
          ? 'bg-white/10 p-3 text-white hover:bg-white/20'
          : 'bg-black/45 p-2 text-white hover:bg-black/65',
      )}
    >
      <Icon className={variant === 'lightbox' ? 'h-6 w-6' : 'h-4 w-4'} />
    </button>
  )
}

/** Small play affordance reused by the video thumbnails. */
export function PlayOverlay() {
  return (
    <span className="pointer-events-none absolute inset-0 grid place-items-center">
      <span className="rounded-full bg-black/50 p-3 backdrop-blur-sm">
        <PlayIcon className="h-5 w-5 text-white" />
      </span>
    </span>
  )
}
