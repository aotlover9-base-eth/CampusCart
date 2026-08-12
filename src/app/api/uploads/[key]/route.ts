import fs from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const MIME_MAP: Record<string, string> = {
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
): Promise<NextResponse> {
  const { key } = await params

  // Security check: strictly validate key format (16 hex chars + extension)
  if (!/^[a-f0-9]{16}\.[a-z0-9]{2,5}$/i.test(key)) {
    return new NextResponse('Invalid storage key', { status: 400 })
  }

  const ext = key.split('.').pop()?.toLowerCase() ?? 'webp'
  const contentType = MIME_MAP[ext] ?? 'application/octet-stream'

  // Look in /tmp/uploads first, then fallback to public/uploads
  const pathsToTry = [
    path.join('/tmp', 'uploads', key),
    path.join(process.cwd(), 'public', 'uploads', key),
  ]

  for (const filePath of pathsToTry) {
    try {
      const buffer = await fs.readFile(filePath)
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    } catch {
      // Continue to next path
    }
  }

  return new NextResponse('File not found', { status: 404 })
}
