/**
 * Browser-side image downscaling, run before upload.
 *
 * A phone camera frame is routinely 4-8 MB. The server re-encodes everything to
 * WebP anyway, so shrinking first costs nothing in quality but saves most of the
 * upload time on a congested campus network.
 *
 * Failure is never fatal: if anything in the canvas path breaks, the original
 * file is returned and the server handles it.
 */

const MAX_EDGE = 2_048
const QUALITY = 0.82
/** Below this, re-encoding tends to make the file bigger rather than smaller. */
const SKIP_UNDER_BYTES = 320 * 1024

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  // Animated GIFs and SVGs lose their point when flattened to a canvas.
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file
  if (file.size < SKIP_UNDER_BYTES) return file

  try {
    const bitmap = await loadBitmap(file)
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))

    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) return file

    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', QUALITY)
    })

    // Keep whichever is actually smaller.
    if (!blob || blob.size >= file.size) return file

    return new File([blob], replaceExtension(file.name, 'webp'), {
      type: 'image/webp',
      lastModified: file.lastModified,
    })
  } catch {
    return file
  }
}

async function loadBitmap(file: File): Promise<ImageBitmap & { close?: () => void }> {
  if (typeof createImageBitmap === 'function') {
    // `imageOrientation` applies the EXIF rotation, which canvas otherwise drops.
    return createImageBitmap(file, { imageOrientation: 'from-image' })
  }

  // Safari fallback: decode through an <img> element instead.
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = 'sync'
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('decode failed'))
      image.src = url
    })
    return image as unknown as ImageBitmap
  } finally {
    URL.revokeObjectURL(url)
  }
}

function replaceExtension(name: string, extension: string): string {
  const base = name.replace(/\.[^./\\]+$/, '')
  return `${base || 'photo'}.${extension}`
}
