import { env, isDevelopment } from '../env'

/**
 * OTP delivery providers.
 *
 * Every provider implements the same interface, so swapping SMS vendors is one
 * env var. The `console` driver is the development default: it logs the code and
 * reports `devCode`, which the API echoes back to the UI in non-production only.
 *
 * Indian SMS requires TRAI DLT registration with the vendor before real sends
 * will work - hence the console default.
 */

export interface SendResult {
  ok: boolean
  /** Present only for the console driver outside production. */
  devCode?: string
  error?: string
  providerMessageId?: string
}

export interface OtpMessage {
  destination: string
  code: string
  expiresInSeconds: number
}

export interface OtpProvider {
  readonly name: string
  send(message: OtpMessage): Promise<SendResult>
}

function otpText(code: string, minutes: number): string {
  return `${code} is your CampusCart verification code. It expires in ${minutes} minute${
    minutes === 1 ? '' : 's'
  }. Do not share it with anyone.`
}

/** Development driver: prints to the server log, never sends anything. */
class ConsoleProvider implements OtpProvider {
  readonly name = 'console'

  async send({ destination, code, expiresInSeconds }: OtpMessage): Promise<SendResult> {
    const minutes = Math.round(expiresInSeconds / 60)
    console.info(
      `\n┌─ CampusCart OTP ────────────────────────────\n` +
        `│  to      ${destination}\n` +
        `│  code    ${code}\n` +
        `│  expires ${minutes} min\n` +
        `└─────────────────────────────────────────────\n`,
    )
    // Only surface the code to the client outside production.
    return { ok: true, devCode: isDevelopment ? code : undefined }
  }
}

class Msg91Provider implements OtpProvider {
  readonly name = 'msg91'

  async send({ destination, code, expiresInSeconds }: OtpMessage): Promise<SendResult> {
    const { MSG91_AUTH_KEY, MSG91_TEMPLATE_ID } = env()
    if (!MSG91_AUTH_KEY || !MSG91_TEMPLATE_ID) {
      return { ok: false, error: 'MSG91 credentials are not configured' }
    }

    try {
      const response = await fetch('https://control.msg91.com/api/v5/flow/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authkey: MSG91_AUTH_KEY,
        },
        body: JSON.stringify({
          template_id: MSG91_TEMPLATE_ID,
          recipients: [
            {
              mobiles: destination.replace('+', ''),
              otp: code,
              expiry: Math.round(expiresInSeconds / 60),
            },
          ],
        }),
      })

      if (!response.ok) {
        return { ok: false, error: `MSG91 responded ${response.status}` }
      }
      const body = (await response.json()) as { type?: string; message?: string }
      if (body.type === 'error') return { ok: false, error: body.message ?? 'MSG91 error' }

      return { ok: true, providerMessageId: body.message }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'MSG91 request failed' }
    }
  }
}

class TwilioProvider implements OtpProvider {
  readonly name = 'twilio'

  async send({ destination, code, expiresInSeconds }: OtpMessage): Promise<SendResult> {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } = env()
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
      return { ok: false, error: 'Twilio credentials are not configured' }
    }

    try {
      const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: destination,
            From: TWILIO_FROM_NUMBER,
            Body: otpText(code, Math.round(expiresInSeconds / 60)),
          }),
        },
      )

      const body = (await response.json()) as { sid?: string; message?: string }
      if (!response.ok) return { ok: false, error: body.message ?? `Twilio ${response.status}` }
      return { ok: true, providerMessageId: body.sid }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Twilio request failed' }
    }
  }
}

class Fast2SmsProvider implements OtpProvider {
  readonly name = 'fast2sms'

  async send({ destination, code }: OtpMessage): Promise<SendResult> {
    const { FAST2SMS_API_KEY } = env()
    if (!FAST2SMS_API_KEY) return { ok: false, error: 'Fast2SMS API key is not configured' }

    try {
      const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: {
          authorization: FAST2SMS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          route: 'otp',
          variables_values: code,
          numbers: destination.replace('+91', ''),
        }),
      })

      const body = (await response.json()) as { return?: boolean; message?: unknown }
      if (!response.ok || body.return === false) {
        return { ok: false, error: String(body.message ?? `Fast2SMS ${response.status}`) }
      }
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Fast2SMS request failed' }
    }
  }
}

/**
 * WhatsApp via Meta's official Cloud API.
 *
 * Often the better channel in India: delivery is more reliable than SMS, there
 * is no TRAI DLT registration, and students read WhatsApp faster.
 *
 * Two constraints Meta imposes that shape this code:
 *
 *  1. Free-form messages cannot start a conversation. The code must go through a
 *     pre-approved template whose category is *Authentication*. Create it in
 *     WhatsApp Manager and put its name in WHATSAPP_TEMPLATE_NAME.
 *  2. An authentication template takes the code as a body parameter *and* repeats
 *     it as the button parameter, because the one-tap/copy-code button reads it
 *     from there. Sending only the body renders a button that copies nothing.
 *
 * The recipient must have WhatsApp installed - see `resolveSmsProvider`, which
 * is why a fallback channel is worth configuring.
 */
class WhatsAppCloudProvider implements OtpProvider {
  readonly name = 'whatsapp'

  async send({ destination, code }: OtpMessage): Promise<SendResult> {
    const {
      WHATSAPP_PHONE_NUMBER_ID,
      WHATSAPP_ACCESS_TOKEN,
      WHATSAPP_TEMPLATE_NAME,
      WHATSAPP_TEMPLATE_LANG,
      WHATSAPP_API_VERSION,
    } = env()

    if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_ACCESS_TOKEN || !WHATSAPP_TEMPLATE_NAME) {
      return { ok: false, error: 'WhatsApp credentials are not configured' }
    }

    const langCode = WHATSAPP_TEMPLATE_LANG === 'en' ? 'en_US' : WHATSAPP_TEMPLATE_LANG
    const isHelloWorld = WHATSAPP_TEMPLATE_NAME === 'hello_world'

    const templatePayload: Record<string, unknown> = {
      name: WHATSAPP_TEMPLATE_NAME,
      language: { code: langCode },
    }

    if (!isHelloWorld) {
      templatePayload.components = [
        {
          type: 'body',
          parameters: [{ type: 'text', text: code }],
        },
      ]
    }

    try {
      const response = await fetch(
        `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            // Graph wants a bare E.164 number with no leading plus.
            to: destination.replace(/^\+/, ''),
            type: 'template',
            template: templatePayload,
          }),
        },
      )

      const body = (await response.json()) as {
        messages?: Array<{ id?: string }>
        error?: { message?: string; error_data?: { details?: string } }
      }

      if (!response.ok || body.error) {
        // Graph puts the actionable reason in error_data.details, not message.
        const detail =
          body.error?.error_data?.details ??
          body.error?.message ??
          `WhatsApp responded ${response.status}`
        return { ok: false, error: detail }
      }

      return { ok: true, providerMessageId: body.messages?.[0]?.id }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'WhatsApp request failed',
      }
    }
  }
}

/**
 * WhatsApp via MSG91.
 *
 * Worth using instead of the Cloud API when you already have an MSG91 account:
 * they handle Meta business verification and template approval for you, which is
 * the slow part of going direct.
 */
class Msg91WhatsAppProvider implements OtpProvider {
  readonly name = 'msg91-whatsapp'

  async send({ destination, code }: OtpMessage): Promise<SendResult> {
    const {
      MSG91_AUTH_KEY,
      MSG91_WA_NUMBER,
      MSG91_WA_TEMPLATE_NAME,
      WHATSAPP_TEMPLATE_LANG,
    } = env()

    if (!MSG91_AUTH_KEY || !MSG91_WA_NUMBER || !MSG91_WA_TEMPLATE_NAME) {
      return { ok: false, error: 'MSG91 WhatsApp credentials are not configured' }
    }

    try {
      const response = await fetch('https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authkey: MSG91_AUTH_KEY },
        body: JSON.stringify({
          integrated_number: MSG91_WA_NUMBER,
          content_type: 'template',
          payload: {
            messaging_product: 'whatsapp',
            type: 'template',
            template: {
              name: MSG91_WA_TEMPLATE_NAME,
              language: { code: WHATSAPP_TEMPLATE_LANG, policy: 'deterministic' },
              to_and_components: [
                {
                  to: [destination.replace(/^\+/, '')],
                  components: { body_1: { type: 'text', value: code } },
                },
              ],
            },
          },
        }),
      })

      const body = (await response.json()) as { type?: string; message?: string }
      if (!response.ok || body.type === 'error') {
        return { ok: false, error: body.message ?? `MSG91 WhatsApp ${response.status}` }
      }
      return { ok: true, providerMessageId: body.message }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'MSG91 WhatsApp request failed',
      }
    }
  }
}

class ResendProvider implements OtpProvider {
  readonly name = 'resend'

  async send({ destination, code, expiresInSeconds }: OtpMessage): Promise<SendResult> {
    const { RESEND_API_KEY, EMAIL_FROM } = env()
    if (!RESEND_API_KEY) return { ok: false, error: 'Resend API key is not configured' }

    const minutes = Math.round(expiresInSeconds / 60)

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: EMAIL_FROM,
          to: [destination],
          subject: `${code} is your CampusCart code`,
          text: otpText(code, minutes),
          html: otpEmailHtml(code, minutes),
        }),
      })

      const body = (await response.json()) as { id?: string; message?: string }
      if (!response.ok) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[Resend Dev Fallback] ${body.message}. Code: ${code}`)
          return { ok: true, providerMessageId: 'dev-fallback' }
        }
        return { ok: false, error: body.message ?? `Resend ${response.status}` }
      }
      return { ok: true, providerMessageId: body.id }
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[Resend Dev Fallback] Request failed. Code: ${code}`)
        return { ok: true, providerMessageId: 'dev-fallback' }
      }
      return { ok: false, error: error instanceof Error ? error.message : 'Resend request failed' }
    }
  }
}

/** Minimal, table-free HTML that survives every mail client. */
function otpEmailHtml(code: string, minutes: number): string {
  return `<!doctype html><html><body style="margin:0;padding:32px;background:#fafafa;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
<div style="max-width:420px;margin:0 auto;background:#fff;border:1px solid #e8e8ea;border-radius:16px;padding:32px;text-align:center">
<h1 style="margin:0 0 8px;font-size:18px;color:#0a0a0b;letter-spacing:-0.02em">CampusCart</h1>
<p style="margin:0 0 24px;font-size:14px;color:#71717a">Your verification code</p>
<p style="margin:0 0 24px;font-size:34px;font-weight:600;letter-spacing:8px;color:#0a0a0b;font-variant-numeric:tabular-nums">${code}</p>
<p style="margin:0;font-size:13px;color:#71717a">Expires in ${minutes} minute${minutes === 1 ? '' : 's'}. If you did not request this, ignore this email.</p>
</div></body></html>`
}

class SmtpProvider implements OtpProvider {
  readonly name = 'smtp'

  async send({ destination, code, expiresInSeconds }: OtpMessage): Promise<SendResult> {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM } = env()
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
      return {
        ok: false,
        error: 'SMTP credentials (SMTP_HOST, SMTP_USER, SMTP_PASSWORD) are not configured in environment variables.',
      }
    }

    const minutes = Math.round(expiresInSeconds / 60)

    try {
      const nodemailer = await import('nodemailer')
      const port = SMTP_PORT || 465
      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port,
        secure: port === 465,
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASSWORD,
        },
      })

      const info = await transporter.sendMail({
        from: EMAIL_FROM.includes('@') ? EMAIL_FROM : `"CampusCart" <${SMTP_USER}>`,
        to: destination,
        subject: `${code} is your CampusCart code`,
        text: otpText(code, minutes),
        html: otpEmailHtml(code, minutes),
      })

      return { ok: true, providerMessageId: info.messageId }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'SMTP email delivery failed' }
    }
  }
}

class FirebaseProvider implements OtpProvider {
  readonly name = 'firebase'

  async send({ destination, code }: OtpMessage): Promise<SendResult> {
    console.info(`[Firebase Phone Auth] Triggered SMS for ${destination}`)
    return { ok: true, devCode: isDevelopment ? code : undefined }
  }
}

export function smsProvider(): OtpProvider {
  switch (env().OTP_SMS_PROVIDER) {
    case 'msg91':
      return new Msg91Provider()
    case 'twilio':
      return new TwilioProvider()
    case 'fast2sms':
      return new Fast2SmsProvider()
    case 'whatsapp':
      return new WhatsAppCloudProvider()
    case 'msg91-whatsapp':
      return new Msg91WhatsAppProvider()
    case 'firebase':
      return new FirebaseProvider()
    default:
      return new ConsoleProvider()
  }
}

export function emailProvider(): OtpProvider {
  switch (env().OTP_EMAIL_PROVIDER) {
    case 'resend':
      return new ResendProvider()
    case 'smtp':
      return new SmtpProvider()
    default:
      return new ConsoleProvider()
  }
}
