import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { v2 as cloudinary } from 'cloudinary'
import { env, publicEnv } from './env'
import { validateUpload } from './file-type'
import { db } from './db'

/**
 * Storage driver abstraction.
 *
 * Local disk writes to `public/uploads`, content-addressed by hash so the same
 * file uploaded twice consumes only one slot. S3/R2 swaps in with one env var.
 */

export interface StorageDriver {
  write(buffer: Buffer, mimeType: string): Promise<{ key: string; url: string }>
  delete(key: string): Promise<void>
  url(key: string): string
}

/** Generate a content-addressed key: first 16 hex of SHA-256 + extension. */
async function contentKey(buffer: Buffer, mimeType: string): Promise<string> {
  const hex = createHash('sha256').update(buffer).digest('hex').slice(0, 16)
  const ext = mimeType.split('/')[1] ?? 'bin'
  return `${hex}.${ext}`
}

class LocalDriver implements StorageDriver {
  private readonly dir: string
  private readonly baseUrl: string
  private readonly tmpDir: string

  constructor() {
    const leaf = path.basename(env().STORAGE_LOCAL_DIR)
    const isVercel = Boolean(process.env.VERCEL)
    this.tmpDir = path.join('/tmp', leaf)

    if (isVercel) {
      this.dir = this.tmpDir
      this.baseUrl = '/api/uploads'
    } else {
      this.dir = path.join(process.cwd(), 'public', leaf)
      this.baseUrl = `/${leaf}`
    }
  }

  private resolveKey(key: string): string {
    if (!/^[a-f0-9]{16}\.[a-z0-9]{2,5}$/i.test(key)) {
      throw new Error('Invalid storage key')
    }
    return path.join(this.dir, key)
  }

  async write(buffer: Buffer, mimeType: string): Promise<{ key: string; url: string }> {
    const key = await contentKey(buffer, mimeType)
    const filePath = this.resolveKey(key)

    // Persist to Neon DB so media is always recoverable across serverless recycles
    try {
      await db.mediaData.upsert({
        where: { key },
        create: { key, mimeType, data: new Uint8Array(buffer) },
        update: {},
      })
    } catch (err) {
      console.error('Error saving media to DB:', err)
    }

    try {
      await fs.access(filePath)
    } catch {
      try {
        await fs.mkdir(this.dir, { recursive: true })
        await fs.writeFile(filePath, buffer)
      } catch {
        await fs.mkdir(this.tmpDir, { recursive: true }).catch(() => null)
        const tmpPath = path.join(this.tmpDir, key)
        await fs.writeFile(tmpPath, buffer).catch(() => null)
      }
    }

    const url = `${this.baseUrl}/${key}`
    return { key, url }
  }

  async delete(key: string): Promise<void> {
    await fs.unlink(this.resolveKey(key)).catch(() => null)
    await fs.unlink(path.join(this.tmpDir, key)).catch(() => null)
    await db.mediaData.delete({ where: { key } }).catch(() => null)
  }

  url(key: string): string {
    if (!key) return ''
    if (key.startsWith('data:') || key.startsWith('http://') || key.startsWith('https://')) {
      return key
    }
    return `${this.baseUrl}/${key}`
  }
}

class CloudinaryDriver implements StorageDriver {
  private configured = false

  constructor() {
    try {
      const e = env()
      const url = e.CLOUDINARY_URL || process.env.CLOUDINARY_URL
      const cloudName = e.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME
      const apiKey = e.CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY
      const apiSecret = e.CLOUDINARY_API_SECRET || process.env.CLOUDINARY_API_SECRET

      if (url) {
        cloudinary.config({ cloudinary_url: url })
        this.configured = true
      } else if (cloudName && apiKey && apiSecret) {
        cloudinary.config({
          cloud_name: cloudName,
          api_key: apiKey,
          api_secret: apiSecret,
          secure: true,
        })
        this.configured = true
      }
    } catch {
      // Env reading fails during boot if optional vars are not set
    }
  }

  async write(buffer: Buffer, mimeType: string): Promise<{ key: string; url: string }> {
    if (!this.configured) {
      return new LocalDriver().write(buffer, mimeType)
    }

    return new Promise((resolve, reject) => {
      const isVideo = mimeType.startsWith('video/')
      const resourceType = isVideo ? 'video' : 'image'

      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'campuscart',
          resource_type: resourceType,
          format: isVideo ? undefined : 'webp',
        },
        (error, result) => {
          if (error || !result) {
            console.error('Cloudinary upload error, falling back to LocalDriver:', error)
            return new LocalDriver().write(buffer, mimeType).then(resolve).catch(reject)
          }
          resolve({
            key: result.public_id,
            url: result.secure_url,
          })
        },
      )

      uploadStream.end(buffer)
    })
  }

  async delete(key: string): Promise<void> {
    if (!this.configured || !key) return
    if (key.startsWith('http://') || key.startsWith('https://')) return
    try {
      await cloudinary.uploader.destroy(key)
    } catch {
      // Ignore delete errors
    }
  }

  url(key: string): string {
    if (!key) return ''
    if (key.startsWith('data:') || key.startsWith('http://') || key.startsWith('https://')) {
      return key
    }
    if (this.configured) {
      return cloudinary.url(key, { secure: true })
    }
    return `/api/uploads/${key}`
  }
}

let driverInstance: StorageDriver | null = null

export function storage(): StorageDriver {
  if (!driverInstance) {
    let useCloudinary = false
    try {
      const e = env()
      useCloudinary =
        e.STORAGE_DRIVER === 'cloudinary' ||
        Boolean(e.CLOUDINARY_CLOUD_NAME || e.CLOUDINARY_URL)
    } catch {
      useCloudinary = Boolean(
        process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_URL,
      )
    }

    if (useCloudinary) {
      driverInstance = new CloudinaryDriver()
    } else {
      driverInstance = new LocalDriver()
    }
  }
  return driverInstance
}

export function absoluteUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return ''
  if (/^data:|^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  const base = publicEnv.appUrl.replace(/\/$/, '')
  return `${base}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`
}

interface ProcessedImage {
  key: string
  url: string
  thumbnailKey: string
  thumbnailUrl: string
  blurDataUrl: string
  width: number
  height: number
  sizeBytes: number
}

export async function processImage(buffer: Buffer): Promise<ProcessedImage> {
  const verdict = validateUpload(buffer, 'image')
  if (!verdict.ok) throw new Error(verdict.error)

  const { MAX_IMAGE_MB } = env()
  if (buffer.length > MAX_IMAGE_MB * 1024 * 1024) {
    throw new Error(`Image must be under ${MAX_IMAGE_MB} MB`)
  }

  const metadata = await sharp(buffer).metadata()
  if (!metadata.width || !metadata.height) {
    throw new Error('Could not read image dimensions')
  }

  if (metadata.width * metadata.height > 50_000_000) {
    throw new Error('Image resolution is too large')
  }

  const normalized = await sharp(buffer)
    .rotate()
    .resize(2400, 2400, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer()

  const [thumbnail, blurBuffer] = await Promise.all([
    sharp(normalized).resize(400, 400, { fit: 'inside' }).webp({ quality: 80 }).toBuffer(),
    sharp(normalized).resize(16, 16, { fit: 'inside' }).webp({ quality: 50 }).toBuffer(),
  ])

  const store = storage()
  const [main, thumb] = await Promise.all([
    store.write(normalized, 'image/webp'),
    store.write(thumbnail, 'image/webp'),
  ])

  return {
    key: main.key,
    url: main.url,
    thumbnailKey: thumb.key,
    thumbnailUrl: thumb.url,
    blurDataUrl: `data:image/webp;base64,${blurBuffer.toString('base64')}`,
    width: metadata.width,
    height: metadata.height,
    sizeBytes: normalized.length,
  }
}

/**
 * Upload pipeline for videos.
 *
 * Videos are stored as uploaded - transcoding and poster-frame extraction need
 * ffmpeg, which is not available on every runtime. The type is still verified
 * from magic bytes, so a disguised file cannot get through.
 */

interface ProcessedVideo {
  key: string
  url: string
  mimeType: string
  sizeBytes: number
}

export async function processVideo(buffer: Buffer): Promise<ProcessedVideo> {
  const verdict = validateUpload(buffer, 'video')
  if (!verdict.ok) throw new Error(verdict.error)

  const { MAX_VIDEO_MB } = env()
  if (buffer.length > MAX_VIDEO_MB * 1024 * 1024) {
    throw new Error(`Video must be under ${MAX_VIDEO_MB} MB`)
  }

  const store = storage()
  const { key, url } = await store.write(buffer, verdict.type)

  return { key, url, mimeType: verdict.type, sizeBytes: buffer.length }
}
