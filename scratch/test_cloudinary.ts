import { storage } from '../src/lib/storage'

async function testCloudinary() {
  console.log('Testing Cloudinary Storage Driver...')
  const store = storage()

  // 1x1 WebP dummy buffer
  const sampleBuffer = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64',
  )

  const result = await store.write(sampleBuffer, 'image/png')
  console.log('✅ Cloudinary Upload Success!')
  console.log('Key:', result.key)
  console.log('URL:', result.url)
  process.exit(0)
}

testCloudinary().catch((err) => {
  console.error('❌ Cloudinary Upload Failed:', err)
  process.exit(1)
})
