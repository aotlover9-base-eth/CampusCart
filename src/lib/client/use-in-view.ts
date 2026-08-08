'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Reports whether an element is currently in view.
 *
 * One IntersectionObserver per element is fine here — the feed holds tens of
 * cards, not thousands, and a shared observer would need its own callback
 * registry for no measurable gain.
 */
export function useInView<T extends Element>(options?: {
  /** Fire once and disconnect. Right for lazy-mounting, wrong for autoplay. */
  once?: boolean
  threshold?: number
  rootMargin?: string
}): { ref: React.RefObject<T | null>; inView: boolean } {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)

  const { once = false, threshold = 0, rootMargin = '0px' } = options ?? {}

  useEffect(() => {
    const element = ref.current
    if (!element) return

    // Without IntersectionObserver, treat everything as visible rather than
    // hiding content that would otherwise never reveal itself.
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry) return

        setInView(entry.isIntersecting)
        if (entry.isIntersecting && once) observer.disconnect()
      },
      { threshold, rootMargin },
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [once, threshold, rootMargin])

  return { ref, inView }
}

/**
 * Infinite-scroll sentinel.
 *
 * Calls `onLoadMore` when the returned ref scrolls into view. The generous
 * default rootMargin starts the fetch a screen early, so the next page is
 * usually resolved before the user reaches the bottom.
 */
export function useInfiniteScroll(
  onLoadMore: () => void,
  options: { hasMore: boolean; loading: boolean; rootMargin?: string },
): React.RefObject<HTMLDivElement | null> {
  const sentinelRef = useRef<HTMLDivElement>(null)
  // Kept in a ref so the observer isn't torn down and rebuilt on every render.
  const callbackRef = useRef(onLoadMore)
  callbackRef.current = onLoadMore

  const { hasMore, loading, rootMargin = '600px' } = options

  useEffect(() => {
    const element = sentinelRef.current
    if (!element || !hasMore || loading) return
    if (typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) callbackRef.current()
      },
      { rootMargin },
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [hasMore, loading, rootMargin])

  return sentinelRef
}
