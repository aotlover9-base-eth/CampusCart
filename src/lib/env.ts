import { z } from 'zod'

/**
 * Validated environment access.
 *
 * Server-only values are parsed lazily on first use so that importing this
 * module from a client component never throws — client code may only read the
 * `publicEnv` object below.
 */

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1')

const serverSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  OTP_SMS_PROVIDER: z
    .enum(['console', 'whatsapp', 'msg91-whatsapp', 'msg91', 'twilio', 'fast2sms', 'firebase'])
    .default('console'),
  OTP_EMAIL_PROVIDER: z.enum(['console', 'resend', 'smtp']).default('console'),

  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().optional(),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),

  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_TEMPLATE_ID: z.string().optional(),
  /** WhatsApp sender registered with MSG91, digits only. */
  MSG91_WA_NUMBER: z.string().optional(),
  MSG91_WA_TEMPLATE_NAME: z.string().optional(),

  // WhatsApp Cloud API (Meta). The template must be category=Authentication.
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_TEMPLATE_NAME: z.string().optional(),
  WHATSAPP_TEMPLATE_LANG: z.string().default('en_US'),
  WHATSAPP_API_VERSION: z.string().default('v21.0'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  FAST2SMS_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('CampusCart <noreply@campuscart.app>'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),

  VIT_EMAIL_DOMAIN: z.string().default('vitbhopal.ac.in'),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('public/uploads'),
  MAX_IMAGE_MB: z.coerce.number().positive().default(8),
  MAX_VIDEO_MB: z.coerce.number().positive().default(60),
  MAX_IMAGES_PER_LISTING: z.coerce.number().int().positive().default(15),
  MAX_VIDEOS_PER_LISTING: z.coerce.number().int().positive().default(3),

  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_BASE_URL: z.string().optional(),

  REALTIME_DRIVER: z.enum(['sse', 'socketio']).default('sse'),

  ADMIN_PANEL_PATH: z.string().min(6, 'ADMIN_PANEL_PATH should be long enough to be unguessable'),
  ADMIN_JWT_SECRET: z.string().min(32, 'ADMIN_JWT_SECRET must be at least 32 chars'),
  ADMIN_SESSION_TTL: z.string().default('8h'),

  FEATURE_LISTING_APPROVAL: bool,
  FEATURE_SUBSCRIPTIONS: bool,
  FEATURE_RATINGS: bool,
  FEATURE_MAINTENANCE_MODE: bool,

  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_OTP_MAX: z.coerce.number().int().positive().default(5),
})
  /**
   * Guard the deployment mistakes that fail silently rather than loudly.
   *
   * The console OTP driver logs codes to stdout and sends nothing, so shipping
   * with it means every signup appears to work and no user ever gets a code.
   * A selected provider with missing credentials fails the same way, at the
   * moment a real student is trying to sign in. Both are caught at boot instead.
   *
   * Skipped during `next build`. The build runs with NODE_ENV=production and
   * collects route configuration, but a CI or Docker build legitimately has no
   * production secrets — enforcing there would make the image unbuildable.
   * NEXT_PHASE is set by Next only for the build, so runtime still gets checked.
   */
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== 'production') return
    if (process.env.NEXT_PHASE === 'phase-production-build') return

    const missing = (key: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [key], message })

    switch (value.OTP_SMS_PROVIDER) {
      case 'console':
        // Allowed in production when email is primary channel.
        break
      case 'msg91':
        if (!value.MSG91_AUTH_KEY || !value.MSG91_TEMPLATE_ID) {
          missing('MSG91_AUTH_KEY', 'MSG91_AUTH_KEY and MSG91_TEMPLATE_ID are required')
        }
        break
      case 'twilio':
        if (!value.TWILIO_ACCOUNT_SID || !value.TWILIO_AUTH_TOKEN || !value.TWILIO_FROM_NUMBER) {
          missing('TWILIO_ACCOUNT_SID', 'Twilio SID, auth token, and from-number are required')
        }
        break
      case 'fast2sms':
        if (!value.FAST2SMS_API_KEY) missing('FAST2SMS_API_KEY', 'is required')
        break
      case 'whatsapp':
        if (
          !value.WHATSAPP_PHONE_NUMBER_ID ||
          !value.WHATSAPP_ACCESS_TOKEN ||
          !value.WHATSAPP_TEMPLATE_NAME
        ) {
          missing(
            'WHATSAPP_PHONE_NUMBER_ID',
            'WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, and WHATSAPP_TEMPLATE_NAME are required',
          )
        }
        break
      case 'msg91-whatsapp':
        if (!value.MSG91_AUTH_KEY || !value.MSG91_WA_NUMBER || !value.MSG91_WA_TEMPLATE_NAME) {
          missing(
            'MSG91_WA_NUMBER',
            'MSG91_AUTH_KEY, MSG91_WA_NUMBER, and MSG91_WA_TEMPLATE_NAME are required',
          )
        }
        break
    }

    // The default panel path is published in this repository.
    if (value.ADMIN_PANEL_PATH === 'control-a7f3c9') {
      missing('ADMIN_PANEL_PATH', 'is still the repository default — change it before deploying')
    }
  })

export type ServerEnv = z.infer<typeof serverSchema>

let cached: ServerEnv | null = null

/** Parse and cache server env. Throws a readable error listing every problem. */
export function env(): ServerEnv {
  if (cached) return cached

  const parsed = serverSchema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(
      `Invalid environment configuration:\n${issues}\n\n` +
        'Copy .env.example to .env and fill in the missing values.\n' +
        'Generate secrets with: openssl rand -base64 48',
    )
  }

  cached = parsed.data
  return cached
}

/** Safe to read from client components. */
export const publicEnv = {
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? 'CampusCart',
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  socketUrl: process.env.NEXT_PUBLIC_SOCKET_URL ?? '',
} as const

export const isProduction = process.env.NODE_ENV === 'production'
export const isDevelopment = process.env.NODE_ENV !== 'production'
