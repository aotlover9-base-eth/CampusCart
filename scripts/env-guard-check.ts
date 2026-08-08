import 'dotenv/config'

/**
 * Exercises the production env guards without needing a real deployment.
 *
 * Each case sets NODE_ENV=production plus a deliberately-broken config and
 * asserts that `env()` refuses to boot. Run with `npm run env:check`.
 */

const BASE = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'x'.repeat(48),
  JWT_REFRESH_SECRET: 'y'.repeat(48),
  ADMIN_JWT_SECRET: 'z'.repeat(48),
  ADMIN_PANEL_PATH: 'a-real-secret-path',
  NODE_ENV: 'production',
}

const CASES: Array<{ name: string; env: Record<string, string>; shouldFail: boolean }> = [
  { name: 'console provider in production', env: { OTP_SMS_PROVIDER: 'console' }, shouldFail: true },
  { name: 'whatsapp with no credentials', env: { OTP_SMS_PROVIDER: 'whatsapp' }, shouldFail: true },
  {
    name: 'whatsapp fully configured',
    env: {
      OTP_SMS_PROVIDER: 'whatsapp',
      WHATSAPP_PHONE_NUMBER_ID: '123',
      WHATSAPP_ACCESS_TOKEN: 'tok',
      WHATSAPP_TEMPLATE_NAME: 'campuscart_otp',
    },
    shouldFail: false,
  },
  { name: 'msg91-whatsapp missing template', env: { OTP_SMS_PROVIDER: 'msg91-whatsapp', MSG91_AUTH_KEY: 'k' }, shouldFail: true },
  {
    name: 'default admin path in production',
    env: { OTP_SMS_PROVIDER: 'fast2sms', FAST2SMS_API_KEY: 'k', ADMIN_PANEL_PATH: 'control-a7f3c9' },
    shouldFail: true,
  },
]

async function main(): Promise<void> {
  let failures = 0

  for (const testCase of CASES) {
    // env() caches, so reload the module for each case.
    for (const key of Object.keys(process.env)) {
      if (/^(OTP_|MSG91_|WHATSAPP_|TWILIO_|FAST2SMS_)/.test(key)) delete process.env[key]
    }
    Object.assign(process.env, BASE, testCase.env)

    const mod = await import(`../src/lib/env.ts?case=${encodeURIComponent(testCase.name)}`)

    let threw = false
    let message = ''
    try {
      ;(mod as { env: () => unknown }).env()
    } catch (error) {
      threw = true
      message = (error as Error).message.split('\n').find((l) => l.includes('•'))?.trim() ?? ''
    }

    const pass = threw === testCase.shouldFail
    if (!pass) failures += 1
    console.info(
      `  ${pass ? '✓' : '✗'} ${testCase.name.padEnd(34)} ` +
        `${threw ? 'rejected' : 'accepted'}${message ? ` — ${message.slice(0, 74)}` : ''}`,
    )
  }

  console.info(failures === 0 ? '\n✓ all env guards behave correctly' : `\n✗ ${failures} guard(s) wrong`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
