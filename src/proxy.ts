import { NextResponse, type NextRequest } from 'next/server'

/**
 * Edge middleware: route gating, CSRF token issuance, and security headers.
 *
 * Runs on every request, so it stays dependency-free — no Prisma, no env
 * validation, no crypto beyond Web Crypto. Auth here is a *presence* check on
 * the access cookie; the signature and the user's ban status are verified in
 * route handlers and server components via `currentUser()`. A forged cookie gets
 * past this file and then fails at the real check, which is the correct split:
 * middleware decides where to send you, handlers decide what you may do.
 */

const ACCESS_COOKIE = 'cc_at'
const ADMIN_COOKIE = 'cc_admin'
const CSRF_COOKIE = 'cc_csrf'

/**
 * Signed-in-only prefixes. Everything not listed here is public — `/`, `/login`,
 * `/onboarding`, and the shareable `/listing/:id` and `/u/:id` pages all need to
 * work for a visitor arriving from a WhatsApp link.
 */
const PROTECTED_PREFIXES = [
  '/home',
  '/sell',
  '/chats',
  '/saved',
  '/notifications',
  '/settings',
  '/me',
]

const adminPath = (): string => {
  const raw = process.env.ADMIN_PANEL_PATH ?? 'control-a7f3c9'
  return `/${raw.replace(/^\/+|\/+$/g, '')}`
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl
  const isAdminArea = pathname === adminPath() || pathname.startsWith(`${adminPath()}/`)

  const response = isAdminArea
    ? handleAdminArea(request)
    : handleAppArea(request)

  applySecurityHeaders(response, { isAdminArea })
  ensureCsrfCookie(request, response)

  return response
}

/**
 * The admin panel is unlisted, not merely unlinked. Two properties matter:
 * a wrong path must be indistinguishable from any other 404, and nothing under
 * it may ever be cached or indexed.
 */
function handleAdminArea(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl
  const base = adminPath()
  const hasAdminCookie = Boolean(request.cookies.get(ADMIN_COOKIE)?.value)

  // The login screen is the only page reachable without an admin session.
  const isLoginPage = pathname === base || pathname === `${base}/login`

  if (!hasAdminCookie && !isLoginPage) {
    // Redirect rather than 404: the caller already knows the path exists.
    return NextResponse.redirect(new URL(`${base}/login`, request.url))
  }

  if (hasAdminCookie && pathname === `${base}/login`) {
    return NextResponse.redirect(new URL(`${base}/dashboard`, request.url))
  }

  if (pathname === base) {
    return NextResponse.redirect(
      new URL(hasAdminCookie ? `${base}/dashboard` : `${base}/login`, request.url),
    )
  }

  return NextResponse.next()
}

function handleAppArea(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl
  const isSignedIn = Boolean(request.cookies.get(ACCESS_COOKIE)?.value)

  // Signed-in users have no reason to see the marketing landing page or /login.
  if (isSignedIn && (pathname === '/' || pathname === '/login')) {
    return NextResponse.redirect(new URL('/home', request.url))
  }

  const needsAuth = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )

  if (needsAuth && !isSignedIn) {
    const login = new URL('/login', request.url)
    // /home is the post-login default, so it needs no `next` round-trip; every
    // other protected route preserves where the user was headed.
    if (pathname !== '/home') {
      login.searchParams.set('next', `${pathname}${search}`)
    }
    return NextResponse.redirect(login)
  }

  return NextResponse.next()
}

/**
 * Security headers.
 *
 * CSP is the load-bearing one. Next.js needs 'unsafe-inline' for its style
 * injection and hydration payload; scripts are additionally nonce-free because
 * the App Router inlines bootstrap code. `object-src 'none'` and
 * `frame-ancestors 'none'` close the two gaps that actually get exploited.
 */
function applySecurityHeaders(
  response: NextResponse,
  options: { isAdminArea: boolean },
): void {
  const isDev = process.env.NODE_ENV !== 'production'

  const csp = [
    "default-src 'self'",
    // 'unsafe-eval' is required by the dev-mode React refresh runtime only.
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    // OpenStreetMap tiles for the map picker; data:/blob: for blur placeholders
    // and client-side image compression previews.
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ')

  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-DNS-Prefetch-Control', 'off')
  response.headers.set(
    'Permissions-Policy',
    // Geolocation is allowed on same-origin: day scholars share a pickup point.
    'camera=(), microphone=(), payment=(), usb=(), geolocation=(self)',
  )
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')

  if (options.isAdminArea) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet')
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  }
}

/**
 * Double-submit CSRF token.
 *
 * Readable by client JS on purpose: the client echoes it in an `x-csrf-token`
 * header, and a cross-site attacker cannot read the cookie to forge the match.
 */
function ensureCsrfCookie(request: NextRequest, response: NextResponse): void {
  if (request.cookies.get(CSRF_COOKIE)?.value) return

  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

  response.cookies.set(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
}

export const config = {
  /**
   * Skip static assets and image optimisation. API routes are included so they
   * pick up the security headers and the CSRF cookie, but the handlers do their
   * own auth — middleware never gates them.
   */
  matcher: [
    '/((?!_next/static|_next/image|uploads|brand|favicon\\.ico|favicon\\.svg|manifest\\.json|og\\.png|icon-.*\\.png|apple-touch-icon\\.png|sw\\.js|robots\\.txt|sitemap\\.xml).*)',
  ],
}
