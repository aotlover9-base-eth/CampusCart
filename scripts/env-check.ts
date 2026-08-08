import 'dotenv/config'
import { env } from '../src/lib/env'

/**
 * Validates environment variables against production guards.
 * Run with: npm run env:check
 */
function main(): void {
  console.info('\n── CampusCart Environment Check ──\n')

  try {
    const parsed = env()
    console.info('  ✓ Environment configuration is valid')
    console.info(`    NODE_ENV: ${parsed.NODE_ENV}`)
    console.info(`    OTP_SMS_PROVIDER: ${parsed.OTP_SMS_PROVIDER}`)
    console.info(`    OTP_EMAIL_PROVIDER: ${parsed.OTP_EMAIL_PROVIDER}`)
    console.info(`    STORAGE_DRIVER: ${parsed.STORAGE_DRIVER}`)
    console.info(`    ADMIN_PANEL_PATH: /${parsed.ADMIN_PANEL_PATH}\n`)
  } catch (error) {
    console.error(`  ✗ ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}

main()
