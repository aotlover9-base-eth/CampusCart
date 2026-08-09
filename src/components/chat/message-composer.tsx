'use client'

import { useCallback, useRef, useState } from 'react'
import Image from 'next/image'
import { api } from '@/lib/client/fetcher'
import { compressImage } from '@/lib/client/image-compress'
import { cn } from '@/lib/utils'
import { ImageIcon, SendIcon, XIcon } from '@/components/ui/icons'
import { useToast } from '@/components/ui/toast'
import { temporaryId, type ChatMessage } from './types'

/**
 * Message input.
 *
 * Sends optimistically - the parent renders the bubble before the request
 * resolves. Typing frames are throttled to one every few seconds rather than
 * one per keystroke; the indicator only needs to be roughly right.
 */

const TYPING_THROTTLE_MS = 3_000

interface PendingImage {
  file: File
  previewUrl: string
}

export function MessageComposer({
  conversationId,
  viewerId,
  onOptimistic,
  onSettled,
}: {
  conversationId: string
  viewerId: string
  onOptimistic: (message: ChatMessage) => void
  onSettled: (temporaryId: string, settled: ChatMessage | null) => void
}) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [image, setImage] = useState<PendingImage | null>(null)
  const [sending, setSending] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lastTypingSent = useRef(0)

  const signalTyping = useCallback(
    (typing: boolean) => {
      const now = Date.now()
      if (typing && now - lastTypingSent.current < TYPING_THROTTLE_MS) return
      lastTypingSent.current = typing ? now : 0

      void api('/api/realtime/typing', {
        method: 'POST',
        body: { conversationId, typing },
      }).catch(() => {})
    },
    [conversationId],
  )

  function autoGrow() {
    const node = textareaRef.current
    if (!node) return
    node.style.height = 'auto'
    // Cap the growth so the composer never eats the whole thread.
    node.style.height = `${Math.min(node.scrollHeight, 140)}px`
  }

  function pickImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Only images can be attached.')
      return
    }

    setImage({ file, previewUrl: URL.createObjectURL(file) })
  }

  function clearImage() {
    if (image) URL.revokeObjectURL(image.previewUrl)
    setImage(null)
  }

  async function send() {
    const body = text.trim()
    if ((!body && !image) || sending) return

    setSending(true)
    signalTyping(false)

    const tempId = temporaryId()
    const optimistic: ChatMessage = {
      id: tempId,
      conversationId,
      senderId: viewerId,
      isMine: true,
      kind: image ? 'IMAGE' : 'TEXT',
      body: body || null,
      isDeleted: false,
      media: image
        ? { url: image.previewUrl, thumbnailUrl: image.previewUrl, width: null, height: null, blurDataUrl: null }
        : null,
      offerId: null,
      // A composer send is always plain text or an image, never an offer.
      offer: null,
      phoneRequestId: null,
      phoneRequest: null,
      deliveryState: 'SENDING',
      readAt: null,
      editedAt: null,
      createdAt: new Date().toISOString(),
      pending: true,
    }

    onOptimistic(optimistic)

    // Clear the input immediately so the next message can be typed while this
    // one is still in flight.
    const pendingImage = image
    setText('')
    setImage(null)
    requestAnimationFrame(autoGrow)

    try {
      let uploaded: Record<string, unknown> = {}

      if (pendingImage) {
        const form = new FormData()
        form.set('kind', 'image')
        form.append('files', await compressImage(pendingImage.file))

        const result = await api<{
          files: Array<{
            storageKey: string
            thumbnailKey?: string
            blurDataUrl?: string
            width?: number
            height?: number
          }>
        }>('/api/upload', { method: 'POST', body: form })

        const file = result.files[0]
        if (!file) throw new Error('upload failed')

        uploaded = {
          mediaKey: file.storageKey,
          mediaThumbKey: file.thumbnailKey,
          mediaBlurUrl: file.blurDataUrl,
          mediaWidth: file.width,
          mediaHeight: file.height,
        }
      }

      const response = await api<{ message: ChatMessage }>(
        `/api/conversations/${conversationId}/messages`,
        { method: 'POST', body: { ...(body ? { body } : {}), ...uploaded } },
      )

      onSettled(tempId, response.message)
    } catch {
      onSettled(tempId, null)
      toast.error('Message not sent. Tap to retry.')
      // Put the text back so it is never lost to a failed request.
      if (body) setText((current) => current || body)
    } finally {
      if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl)
      setSending(false)
    }
  }

  const canSend = Boolean(text.trim() || image) && !sending

  return (
    <div className="shrink-0 border-t border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2.5 pb-[max(10px,env(safe-area-inset-bottom))]">
      {image && (
        <div className="relative mb-2 inline-block">
          <Image
            src={image.previewUrl}
            alt=""
            width={72}
            height={72}
            unoptimized
            className="h-18 w-18 rounded-[var(--radius-sm)] object-cover"
          />
          <button
            type="button"
            onClick={clearImage}
            aria-label="Remove image"
            className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[var(--color-ink)] text-[var(--color-ink-inverse)]"
          >
            <XIcon className="h-3 w-3" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <label
          className={cn(
            'grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full',
            'text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)]',
          )}
          aria-label="Attach a photo"
        >
          <ImageIcon className="h-[18px] w-[18px]" />
          <input type="file" accept="image/*" onChange={pickImage} className="sr-only" />
        </label>

        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          placeholder="Message…"
          aria-label="Message"
          onChange={(event) => {
            setText(event.target.value)
            autoGrow()
            signalTyping(event.target.value.length > 0)
          }}
          onBlur={() => signalTyping(false)}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter is a newline. On touch keyboards Enter
            // inserts a newline as usual, since there is no Shift to hold.
            if (event.key === 'Enter' && !event.shiftKey && !isTouchDevice()) {
              event.preventDefault()
              void send()
            }
          }}
          className={cn(
            'max-h-[140px] min-h-[38px] flex-1 resize-none rounded-[var(--radius-lg)] border px-3.5 py-2',
            'border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[14.5px] text-[var(--color-ink)]',
            'placeholder:text-[var(--color-ink-subtle)] focus:border-[var(--color-ink)] focus:outline-none',
          )}
        />

        <button
          type="button"
          onClick={() => void send()}
          disabled={!canSend}
          aria-label="Send message"
          className={cn(
            'grid h-9 w-9 shrink-0 place-items-center rounded-full transition-all',
            canSend
              ? 'bg-[var(--color-ink)] text-[var(--color-ink-inverse)] hover:opacity-90 active:scale-95'
              : 'bg-[var(--color-surface-sunken)] text-[var(--color-ink-subtle)]',
          )}
        >
          <SendIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
}
