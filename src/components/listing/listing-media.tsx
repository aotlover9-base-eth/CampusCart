'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { useInView } from '@/lib/client/use-in-view'
import { MuteIcon, PlayIcon, UnmuteIcon, VideoIcon } from '@/components/ui/icons'

export interface MediaItem {
  url: string
  type: 'IMAGE' | 'VIDEO'
  thumbnailUrl?: string | null
  width?: number | null
  height?: number | null
  blurDataUrl?: string | null
}

/**
 * Feed media tile.
 *
 * Videos autoplay silently once at least half the tile is on screen and pause
 * when it leaves - the Instagram/X behaviour. Muted autoplay is the only kind
 * browsers permit without a user gesture, so sound stays opt-in via the toggle,
 * and the choice is remembered for the session.
 */

let sessionMuted = true

export function ListingMedia({
  item,
  priority = false,
  className,
  sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw',
  autoplay = true,
}: {
  item: MediaItem
  priority?: boolean
  className?: string
  sizes?: string
  autoplay?: boolean
}) {
  // A video needs to be near-centre before it plays; an image only needs to be
  // close enough that decoding it is not wasted work.
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.5 })
  const videoRef = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(sessionMuted)
  const [loaded, setLoaded] = useState(false)

  const isVideo = item.type === 'VIDEO'

  useEffect(() => {
    const video = videoRef.current
    if (!video || !isVideo || !autoplay) return

    // Respect a reduced-motion preference by leaving playback to the user.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    if (inView) {
      // play() rejects if the tab is backgrounded or the gesture policy blocks
      // it. Neither is actionable, so the poster simply stays put.
      void video.play().catch(() => {})
    } else {
      video.pause()
      video.currentTime = 0
    }
  }, [inView, isVideo, autoplay])

  function toggleMuted(event: React.MouseEvent) {
    // The tile sits inside a link to the listing.
    event.preventDefault()
    event.stopPropagation()

    const next = !muted
    setMuted(next)
    sessionMuted = next
  }

  return (
    <div
      ref={ref}
      className={cn(
        'relative isolate overflow-hidden bg-[var(--color-surface-sunken)]',
        className,
      )}
    >
      {isVideo ? (
        <>
          <video
            ref={videoRef}
            src={item.url}
            poster={item.thumbnailUrl ?? undefined}
            muted={muted}
            loop
            playsInline
            preload="metadata"
            onLoadedData={() => setLoaded(true)}
            className={cn(
              'h-full w-full object-cover transition-opacity duration-500',
              loaded ? 'opacity-100' : 'opacity-0',
            )}
          />

          {!loaded && item.thumbnailUrl && (
            <Image
              src={item.thumbnailUrl}
              alt=""
              fill
              sizes={sizes}
              className="object-cover"
              aria-hidden="true"
            />
          )}

          <span
            className="pointer-events-none absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[11px] font-medium text-white backdrop-blur-sm"
            aria-hidden="true"
          >
            <VideoIcon className="h-3 w-3" />
          </span>

          <button
            type="button"
            onClick={toggleMuted}
            aria-label={muted ? 'Unmute video' : 'Mute video'}
            className={cn(
              'absolute bottom-2.5 right-2.5 rounded-full bg-black/55 p-1.5 text-white backdrop-blur-sm',
              'transition-transform hover:scale-105 active:scale-95',
            )}
          >
            {muted ? <MuteIcon className="h-3.5 w-3.5" /> : <UnmuteIcon className="h-3.5 w-3.5" />}
          </button>

          {!inView && (
            <span
              className="pointer-events-none absolute inset-0 grid place-items-center"
              aria-hidden="true"
            >
              <span className="rounded-full bg-black/45 p-3 backdrop-blur-sm">
                <PlayIcon className="h-5 w-5 text-white" />
              </span>
            </span>
          )}
        </>
      ) : (
        <Image
          src={item.url}
          alt=""
          fill
          sizes={sizes}
          priority={priority}
          // Below-the-fold images decode off the main thread so scrolling stays smooth.
          loading={priority ? undefined : 'lazy'}
          placeholder={item.blurDataUrl ? 'blur' : 'empty'}
          blurDataURL={item.blurDataUrl ?? undefined}
          onLoad={() => setLoaded(true)}
          className={cn(
            'object-cover transition-[opacity,transform] duration-500 ease-out',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
        />
      )}
    </div>
  )
}

/** Neutral stand-in for a listing that has no media at all. */
export function MediaFallback({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'grid place-items-center bg-[var(--color-surface-sunken)] text-[var(--color-ink-subtle)]',
        className,
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 48 48" fill="none" className="h-10 w-10 opacity-40">
        <rect x="6" y="10" width="36" height="28" rx="4" stroke="currentColor" strokeWidth="2" />
        <circle cx="17" cy="20" r="3" stroke="currentColor" strokeWidth="2" />
        <path
          d="m9 34 9-9a3 3 0 0 1 4.2 0L32 34"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}
