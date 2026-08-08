import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

/**
 * Rasterises the brand SVGs in public/brand into the PNG and ICO files that
 * layout.tsx and manifest.json reference.
 *
 * Run with `npm run assets`. Committing the output means a fresh clone does not
 * need sharp to render icons at build time.
 */

const publicDir = path.join(process.cwd(), 'public')
const brandDir = path.join(publicDir, 'brand')

interface PngTarget {
  source: string
  out: string
  size: number
}

const PNG_TARGETS: PngTarget[] = [
  { source: 'mark.svg', out: 'icon-192.png', size: 192 },
  { source: 'mark.svg', out: 'icon-512.png', size: 512 },
  // iOS ignores transparency and applies its own mask, so it gets the padded art.
  { source: 'mark-maskable.svg', out: 'apple-touch-icon.png', size: 180 },
  { source: 'mark-maskable.svg', out: 'icon-maskable-192.png', size: 192 },
  { source: 'mark-maskable.svg', out: 'icon-maskable-512.png', size: 512 },
]

/** Favicon sizes packed into favicon.ico. */
const ICO_SIZES = [16, 32, 48]

async function renderPng(source: string, size: number): Promise<Buffer> {
  const svg = await fs.readFile(path.join(brandDir, source))
  // `density` drives the SVG rasteriser: without scaling it up, small targets
  // render from a 72dpi bitmap and the strokes turn to mush.
  return sharp(svg, { density: Math.max(72, Math.ceil((size / 512) * 72 * 8)) })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer()
}

/**
 * Build an ICO container around PNG entries.
 *
 * Layout: a 6-byte ICONDIR, then one 16-byte ICONDIRENTRY per image, then the
 * image payloads. PNG-compressed entries are valid ICO and every current browser
 * reads them, which avoids hand-rolling a BMP encoder.
 */
function buildIco(images: Array<{ size: number; data: Buffer }>): Buffer {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: 1 = icon
  header.writeUInt16LE(images.length, 4)

  const directory = Buffer.alloc(16 * images.length)
  let offset = header.length + directory.length

  images.forEach((image, index) => {
    const entry = index * 16
    // 0 in the width/height byte means 256px; every size here is smaller.
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, entry)
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, entry + 1)
    directory.writeUInt8(0, entry + 2) // palette size
    directory.writeUInt8(0, entry + 3) // reserved
    directory.writeUInt16LE(1, entry + 4) // colour planes
    directory.writeUInt16LE(32, entry + 6) // bits per pixel
    directory.writeUInt32LE(image.data.length, entry + 8)
    directory.writeUInt32LE(offset, entry + 12)
    offset += image.data.length
  })

  return Buffer.concat([header, directory, ...images.map((i) => i.data)])
}

async function main(): Promise<void> {
  console.info('Rendering CampusCart brand assets…\n')

  for (const target of PNG_TARGETS) {
    const data = await renderPng(target.source, target.size)
    await fs.writeFile(path.join(publicDir, target.out), data)
    console.info(`  ✓ ${target.out} (${target.size}×${target.size}, ${(data.length / 1024).toFixed(1)} KB)`)
  }

  const icoImages = await Promise.all(
    ICO_SIZES.map(async (size) => ({ size, data: await renderPng('favicon.svg', size) })),
  )
  await fs.writeFile(path.join(publicDir, 'favicon.ico'), buildIco(icoImages))
  console.info(`  ✓ favicon.ico (${ICO_SIZES.join(', ')} px)`)

  // Modern browsers prefer the vector favicon; it has to sit at the web root.
  await fs.copyFile(path.join(brandDir, 'favicon.svg'), path.join(publicDir, 'favicon.svg'))
  console.info('  ✓ favicon.svg')

  const ogSvg = await fs.readFile(path.join(brandDir, 'og.svg'))
  const og = await sharp(ogSvg, { density: 144 })
    .resize(1200, 630, { fit: 'cover' })
    .png({ compressionLevel: 9 })
    .toBuffer()
  await fs.writeFile(path.join(publicDir, 'og.png'), og)
  console.info(`  ✓ og.png (1200×630, ${(og.length / 1024).toFixed(1)} KB)`)

  console.info('\nDone.\n')
}

main().catch((error) => {
  console.error('Asset generation failed:', error)
  process.exit(1)
})
