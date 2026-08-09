import { cookies, headers } from 'next/headers'
import { CSRF_COOKIE } from './auth/context'
import { safeEqualHex } from './crypto'
import { publicEnv } from './env'

/**
 * Double-submit CSRF verification.
 *
 * Middleware issues a random token in a JS-readable cookie. The client echoes it
 * in `x-csrf-token`. An attacker on another origin can force the browser to send
 * the cookie but cannot read it to populate the header, so a match proves the
 * request came from our own page.
 *
 * SameSite=Lax on the auth cookies already blocks the classic cross-site POST;
 * this is the second layer, and it also covers same-site subdomain takeover.
 */

export class CsrfError extends Error {
  readonly status = 403
  constructor(message = 'Your session expired. Refresh the page and try again.') {
    super(message)
    this.name = 'CsrfError'
  }
}

/** Header name the client must send. Exported so the fetch helper stays in sync. */
export const CSRF_HEADER = 'x-csrf-token'

/**
 * Verify a state-changing request. Throws CsrfError on mismatch.
 *
 * Also checks Origin against the configured app URL when the header is present -
 * browsers always send it on cross-origin POSTs, so a wrong value is a strong
 * signal regardless of the token.
 */
export async function assertCsrf(): Promise<void> {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()])

  const cookieToken = cookieStore.get(CSRF_COOKIE)?.value
  const headerToken = headerList.get(CSRF_HEADER)

  if (!cookieToken || !headerToken) throw new CsrfError()
  if (!safeEqualHex(cookieToken, headerToken)) throw new CsrfError()

  const origin = headerList.get('origin')
  if (!origin) return

  // The host the browser actually connected to. Behind a proxy the original is
  // in x-forwarded-host, so prefer that.
  const target = headerList.get('x-forwarded-host') ?? headerList.get('host')

  if (!isAllowedOrigin(origin, target)) {
    throw new CsrfError('Request blocked: unrecognised origin.')
  }
}

/**
 * Whether `origin` names this same site.
 *
 * Checked against the request's own host rather than a configured URL. Both
 * headers are set by the browser and neither can be altered by page script, so
 * a same-origin request always agrees on them while a cross-site one cannot:
 * the attacker's page sends its own Origin against our Host.
 *
 * Deriving the expected value from the request is also what keeps this working
 * wherever the app is actually served - a dev server that fell back to another
 * port, a preview deployment, a tunnel - none of which match a hardcoded
 * NEXT_PUBLIC_APP_URL. The configured URL is still accepted, for the case where
 * a proxy rewrites Host to an internal name.
 */
function isAllowedOrigin(origin: string, target: string | null): boolean {
  let candidate: URL
  try {
    candidate = new URL(origin)
  } catch {
    return false
  }

  const targetHost = target?.split(':')[0]
  if (target && (candidate.host === target || candidate.hostname === targetHost)) {
    return true
  }

  // Localhost / 127.0.0.1 loopback fallback for dev environments with variable ports
  if (
    (candidate.hostname === 'localhost' || candidate.hostname === '127.0.0.1') &&
    (!target || target.startsWith('localhost') || target.startsWith('127.0.0.1'))
  ) {
    return true
  }

  try {
    const expected = new URL(publicEnv.appUrl)
    return candidate.host === expected.host || candidate.hostname === expected.hostname
  } catch {
    return false
  }
}
