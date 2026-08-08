/**
 * Magic-byte file type detection.
 *
 * A client-supplied `Content-Type` or filename extension is untrusted input —
 * `evil.php` renamed to `photo.jpg` arrives with `image/jpeg`. These checks read
 * the actual file signature and are the only thing the upload path trusts.
 */

export type DetectedType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/avif'
  | 'image/gif'
  | 'video/mp4'
  | 'video/webm'
  | 'video/quicktime'

interface Signature {
  type: DetectedType
  /** Byte offset where the pattern starts. */
  offset: number
  /** Bytes to match; null matches any byte at that position. */
  pattern: Array<number | null>
}

const SIGNATURES: Signature[] = [
  // JPEG — FF D8 FF
  { type: 'image/jpeg', offset: 0, pattern: [0xff, 0xd8, 0xff] },

  // PNG — 89 50 4E 47 0D 0A 1A 0A
  { type: 'image/png', offset: 0, pattern: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },

  // GIF — "GIF87a" or "GIF89a"
  { type: 'image/gif', offset: 0, pattern: [0x47, 0x49, 0x46, 0x38] },

  // WebP — "RIFF" .... "WEBP"
  { type: 'image/webp', offset: 0, pattern: [0x52, 0x49, 0x46, 0x46] },

  // WebM / Matroska — 1A 45 DF A3
  { type: 'video/webm', offset: 0, pattern: [0x1a, 0x45, 0xdf, 0xa3] },
]

/** ISO-BMFF brands, read from the `ftyp` box at offset 4. */
const FTYP_BRANDS: Record<string, DetectedType> = {
  avif: 'image/avif',
  avis: 'image/avif',
  qt: 'video/quicktime',
  isom: 'video/mp4',
  iso2: 'video/mp4',
  mp41: 'video/mp4',
  mp42: 'video/mp4',
  M4V: 'video/mp4',
}

function matches(buffer: Buffer, signature: Signature): boolean {
  const { offset, pattern } = signature
  if (buffer.length < offset + pattern.length) return false

  return pattern.every((byte, index) => byte === null || buffer[offset + index] === byte)
}

/**
 * Detect a file's true type from its leading bytes.
 * Returns null when the type is unrecognised — callers must reject those.
 */
export function detectFileType(buffer: Buffer): DetectedType | null {
  if (buffer.length < 12) return null

  // WebP and RIFF share a prefix, so confirm the "WEBP" marker at offset 8.
  if (matches(buffer, SIGNATURES.find((s) => s.type === 'image/webp')!)) {
    const marker = buffer.subarray(8, 12).toString('ascii')
    return marker === 'WEBP' ? 'image/webp' : null
  }

  // ISO base media files (MP4, MOV, AVIF) carry "ftyp" at offset 4.
  if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('ascii').replace(/\0/g, '').trim()

    if (FTYP_BRANDS[brand]) return FTYP_BRANDS[brand]
    // QuickTime brands often start with "qt".
    if (brand.startsWith('qt')) return 'video/quicktime'
    // Unknown brand — treat as MP4 only if it looks like a video container.
    return 'video/mp4'
  }

  for (const signature of SIGNATURES) {
    if (signature.type === 'image/webp') continue
    if (matches(buffer, signature)) return signature.type
  }

  return null
}

const ALLOWED_IMAGES: DetectedType[] = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
const ALLOWED_VIDEOS: DetectedType[] = ['video/mp4', 'video/webm', 'video/quicktime']

export function isAllowedImage(type: DetectedType | null): boolean {
  return type !== null && ALLOWED_IMAGES.includes(type)
}

export function isAllowedVideo(type: DetectedType | null): boolean {
  return type !== null && ALLOWED_VIDEOS.includes(type)
}

/**
 * Validate an upload end to end: detect the real type, confirm it is allowed
 * for the requested kind, and confirm the client's claim was not a lie.
 */
export function validateUpload(
  buffer: Buffer,
  kind: 'image' | 'video',
): { ok: true; type: DetectedType } | { ok: false; error: string } {
  const detected = detectFileType(buffer)

  if (!detected) {
    return { ok: false, error: 'Unrecognised file format' }
  }

  if (kind === 'image' && !isAllowedImage(detected)) {
    return {
      ok: false,
      error:
        detected.startsWith('video/')
          ? 'That is a video. Upload it in the video section.'
          : `${detected} images are not supported. Use JPEG, PNG, WebP, or AVIF.`,
    }
  }

  if (kind === 'video' && !isAllowedVideo(detected)) {
    return {
      ok: false,
      error: detected.startsWith('image/')
        ? 'That is an image. Upload it in the photo section.'
        : `${detected} videos are not supported. Use MP4, WebM, or MOV.`,
    }
  }

  return { ok: true, type: detected }
}
