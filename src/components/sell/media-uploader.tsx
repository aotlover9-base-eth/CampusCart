'use client'

import { useCallback, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { api, ApiError } from '@/lib/client/fetcher'
import { compressImage } from '@/lib/client/image-compress'
import { cn } from '@/lib/utils'
import { MAX_IMAGES, MAX_VIDEOS } from '@/lib/constants'
import { ImageIcon, PlayIcon, PlusIcon, StarIcon, XIcon } from '@/components/ui/icons'

/**
 * Drag-and-drop media picker for the sell flow.
 *
 * Images are compressed in the browser before upload - see image-compress for
 * why. Local previews appear the moment files are picked so the grid never
 * looks empty while a slow upload runs.
 */

export interface UploadedMedia {
  kind: 'IMAGE' | 'VIDEO'
  storageKey: string
  url: string
  thumbnailKey?: string
  thumbnailUrl?: string
  blurDataUrl?: string
  mimeType: string
  width?: number
  height?: number
  sizeBytes: number
}

interface PendingItem {
  id: string
  previewUrl: string
  kind: 'IMAGE' | 'VIDEO'
}

export function MediaUploader({
  media,
  onChange,
  disabled,
}: {
  media: UploadedMedia[]
  onChange: (next: UploadedMedia[]) => void
  disabled?: boolean
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<PendingItem[]>([])
  const [dragging, setDragging] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const imageCount = media.filter((m) => m.kind === 'IMAGE').length
  const videoCount = media.filter((m) => m.kind === 'VIDEO').length
  const atCapacity = imageCount >= MAX_IMAGES && videoCount >= MAX_VIDEOS

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList?.length) return
      setNotice(null)

      const images: File[] = []
      const videos: File[] = []
      let rejected = 0

      // Budget against what is already attached, so a second drop can't
      // overshoot the per-listing caps.
      let imageBudget = MAX_IMAGES - imageCount
      let videoBudget = MAX_VIDEOS - videoCount

      for (const file of Array.from(fileList)) {
        if (file.type.startsWith('image/') && imageBudget > 0) {
          images.push(file)
          imageBudget -= 1
        } else if (file.type.startsWith('video/') && videoBudget > 0) {
          videos.push(file)
          videoBudget -= 1
        } else {
          rejected += 1
        }
      }

      if (rejected > 0) {
        setNotice(
          `Skipped ${rejected} file${rejected === 1 ? '' : 's'} - limit is ${MAX_IMAGES} photos and ${MAX_VIDEOS} videos.`,
        )
      }
      if (images.length === 0 && videos.length === 0) return

      const placeholders: PendingItem[] = [...images, ...videos].map((file, index) => ({
        id: `${file.name}-${file.size}-${index}`,
        previewUrl: URL.createObjectURL(file),
        kind: file.type.startsWith('video/') ? 'VIDEO' : 'IMAGE',
      }))
      setPending((prev) => [...prev, ...placeholders])

      try {
        const settled: UploadedMedia[] = []

        if (images.length > 0) {
          const compressed = await Promise.all(images.map(compressImage))
          settled.push(...(await uploadBatch(compressed, 'image')))
        }
        // Videos go in their own request - the server caps each kind separately.
        if (videos.length > 0) {
          settled.push(...(await uploadBatch(videos, 'video')))
        }

        onChange([...media, ...settled])
      } catch (error) {
        setNotice(
          error instanceof ApiError
            ? error.message
            : 'Upload failed. Check your connection and try again.',
        )
      } finally {
        setPending((prev) => {
          const done = new Set(placeholders.map((p) => p.id))
          for (const item of prev) {
            if (done.has(item.id)) URL.revokeObjectURL(item.previewUrl)
          }
          return prev.filter((item) => !done.has(item.id))
        })
        if (inputRef.current) inputRef.current.value = ''
      }
    },
    [imageCount, media, onChange, videoCount],
  )

  /** The first entry is the cover, so promoting one is just a reorder. */
  function makeCover(storageKey: string) {
    const target = media.find((m) => m.storageKey === storageKey)
    if (!target) return
    onChange([target, ...media.filter((m) => m.storageKey !== storageKey)])
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(event) => {
          event.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          if (!disabled) void handleFiles(event.dataTransfer.files)
        }}
        className={cn(
          'rounded-[var(--radius-lg)] border border-dashed p-3 transition-colors duration-200',
          dragging
            ? 'border-[var(--color-line-strong)] bg-[var(--color-surface-sunken)]'
            : 'border-[var(--color-line)]',
          disabled && 'pointer-events-none opacity-60',
        )}
      >
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          <AnimatePresence mode="popLayout" initial={false}>
            {media.map((item, index) => (
              <motion.div
                key={item.storageKey}
                layout
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className="group relative aspect-square overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-surface-sunken)]"
              >
                {item.kind === 'VIDEO' ? (
                  <>
                    <video
                      src={item.url}
                      muted
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-cover"
                    />
                    <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/30">
                      <PlayIcon className="h-6 w-6 text-white" />
                    </span>
                  </>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element -- already-optimized CDN thumbnail */
                  <img
                    src={item.thumbnailUrl ?? item.url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )}

                {index === 0 && (
                  <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                    Cover
                  </span>
                )}

                <div className="absolute inset-x-1.5 bottom-1.5 flex justify-end gap-1 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100">
                  {index !== 0 && (
                    <button
                      type="button"
                      onClick={() => makeCover(item.storageKey)}
                      aria-label="Use as cover"
                      className="grid h-7 w-7 place-items-center rounded-full bg-black/65 text-white backdrop-blur-sm transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                      <StarIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onChange(media.filter((m) => m.storageKey !== item.storageKey))}
                    aria-label="Remove"
                    className="grid h-7 w-7 place-items-center rounded-full bg-black/65 text-white backdrop-blur-sm transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              </motion.div>
            ))}

            {pending.map((item) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                className="relative aspect-square overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-surface-sunken)]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
                <img src={item.previewUrl} alt="" className="h-full w-full object-cover opacity-35" />
                <span className="absolute inset-0 grid place-items-center">
                  <span
                    aria-label="Uploading"
                    role="status"
                    className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-line-strong)] border-t-transparent"
                  />
                </span>
              </motion.div>
            ))}
          </AnimatePresence>

          {!atCapacity && (
            <label
              htmlFor={inputId}
              className={cn(
                'flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5',
                'rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface-sunken)]',
                'text-[var(--color-ink-subtle)] transition-colors duration-200',
                'hover:border-[var(--color-line-strong)] hover:text-[var(--color-ink)]',
                'focus-within:ring-2 focus-within:ring-[var(--color-accent)]',
              )}
            >
              <PlusIcon className="h-5 w-5" />
              <span className="text-[11px] font-medium">Add</span>
            </label>
          )}
        </div>

        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/*,video/*"
          multiple
          disabled={disabled}
          onChange={(event) => void handleFiles(event.target.files)}
          className="sr-only"
        />

        {media.length === 0 && pending.length === 0 && (
          <p className="mt-3 flex items-center gap-1.5 text-[12px] text-[var(--color-ink-subtle)]">
            <ImageIcon className="h-3.5 w-3.5" />
            Drag photos here, or tap Add. The first photo becomes the cover.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 text-[12px]">
        <p className="text-[var(--color-ink-subtle)]">
          {imageCount}/{MAX_IMAGES} photos · {videoCount}/{MAX_VIDEOS} videos
        </p>
        {notice && <p className="text-right text-[var(--color-danger)]">{notice}</p>}
      </div>
    </div>
  )
}

async function uploadBatch(files: File[], kind: 'image' | 'video') {
  const form = new FormData()
  form.set('kind', kind)
  for (const file of files) form.append('files', file)

  const result = await api<{ files: UploadedMedia[] }>('/api/upload', {
    method: 'POST',
    body: form,
  })
  return result.files
}
