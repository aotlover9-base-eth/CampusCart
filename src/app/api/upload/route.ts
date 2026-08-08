import { NextResponse } from 'next/server'
import { fail, mutation, ok } from '@/lib/api'
import { requireUser } from '@/lib/auth/context'
import { writeLimiter } from '@/lib/rate-limit'
import { processImage, processVideo } from '@/lib/storage'
import { env } from '@/lib/env'

/**
 * POST /api/upload
 *
 * Accepts multipart form data and returns storage keys the client then attaches
 * to a listing or message. Uploading is separated from listing creation so the
 * compose screen can show real thumbnails while the seller is still typing.
 *
 * Every file is verified by magic bytes and re-encoded — see src/lib/storage.ts.
 */

// Videos need the full body in memory, so allow generous time on slow uploads.
export const maxDuration = 60

const MAX_FILES_PER_REQUEST = 15

export async function POST(request: Request): Promise<NextResponse> {
  return mutation(async () => {
    const user = await requireUser()

    const limit = await writeLimiter(user.id, 'upload')
    if (!limit.allowed) {
      return fail('You are uploading too quickly. Wait a moment.', 429)
    }

    const contentType = request.headers.get('content-type') ?? ''
    if (!contentType.includes('multipart/form-data')) {
      return fail('Upload must be multipart/form-data', 415)
    }

    let form: FormData
    try {
      form = await request.formData()
    } catch {
      return fail('Could not read the uploaded files', 400)
    }

    const kindRaw = form.get('kind')
    const kind = kindRaw === 'video' ? 'video' : 'image'

    const files = form.getAll('files').filter((entry): entry is File => entry instanceof File)

    if (files.length === 0) {
      return fail('No files were attached', 400)
    }

    const perRequestCap =
      kind === 'video' ? env().MAX_VIDEOS_PER_LISTING : MAX_FILES_PER_REQUEST

    if (files.length > perRequestCap) {
      return fail(`Upload at most ${perRequestCap} ${kind}s at a time`, 400)
    }

    // Process sequentially rather than in parallel: sharp is CPU-bound and
    // fifteen concurrent re-encodes would starve the event loop.
    const uploaded: Array<Record<string, unknown>> = []
    const errors: Array<{ name: string; error: string }> = []

    for (const file of files) {
      try {
        const buffer = Buffer.from(await file.arrayBuffer())

        if (kind === 'video') {
          const result = await processVideo(buffer)
          uploaded.push({
            kind: 'VIDEO',
            storageKey: result.key,
            url: result.url,
            mimeType: result.mimeType,
            sizeBytes: result.sizeBytes,
          })
        } else {
          const result = await processImage(buffer)
          uploaded.push({
            kind: 'IMAGE',
            storageKey: result.key,
            url: result.url,
            thumbnailKey: result.thumbnailKey,
            thumbnailUrl: result.thumbnailUrl,
            blurDataUrl: result.blurDataUrl,
            mimeType: 'image/webp',
            width: result.width,
            height: result.height,
            sizeBytes: result.sizeBytes,
          })
        }
      } catch (error) {
        // One bad file shouldn't discard the rest of the batch.
        errors.push({
          name: file.name,
          error: error instanceof Error ? error.message : 'Could not process this file',
        })
      }
    }

    if (uploaded.length === 0) {
      return fail(errors[0]?.error ?? 'None of the files could be processed', 400)
    }

    return ok({ files: uploaded, failed: errors })
  })
}
