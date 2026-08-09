import { NextResponse } from 'next/server'
import { z } from 'zod'
import { assertCsrf } from './csrf'
import { fieldErrors } from './validation'
import { isDevelopment } from './env'

/**
 * Uniform JSON envelope for every API route.
 *
 * Success: { ok: true, data }
 * Failure: { ok: false, error, fields? }
 *
 * Client code only has to branch on `ok`.
 */

export type ApiSuccess<T> = { ok: true; data: T }
export type ApiFailure = { ok: false; error: string; fields?: Record<string, string> }
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure

export function ok<T>(data: T, init?: ResponseInit): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true as const, data }, init)
}

export function fail(
  error: string,
  status = 400,
  fields?: Record<string, string>,
): NextResponse<ApiFailure> {
  return NextResponse.json({ ok: false as const, error, fields }, { status })
}

export function tooManyRequests(
  error: string,
  retryAfterSeconds: number,
): NextResponse<ApiFailure> {
  return NextResponse.json(
    { ok: false as const, error },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  )
}

/**
 * Wrap a route handler so thrown errors become well-formed JSON instead of an
 * unhandled 500. Auth errors map to their status; validation errors to 400;
 * anything else is logged and reported generically so internals never leak.
 *
 * Typed loosely on purpose: handlers return many different success shapes, and
 * the envelope is what callers actually branch on.
 */
export function handler(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  return fn().catch((error: unknown) => {
    // Deliberate, client-facing errors carry their own 4xx status. Matching on
    // that shape rather than on a list of classes keeps this handler decoupled
    // from every module that defines one - including admin auth, which lives
    // outside lib/auth entirely.
    const status = clientErrorStatus(error)
    if (status !== null) {
      return fail((error as Error).message, status)
    }

    if (error instanceof z.ZodError) {
      return fail('Please check the highlighted fields', 400, fieldErrors(error))
    }

    console.error('[api] unhandled error:', error)

    return fail(
      isDevelopment && error instanceof Error
        ? error.message
        : 'Something went wrong. Please try again.',
      500,
    )
  })
}

/**
 * A 4xx status on a thrown Error means the throw was intentional and the
 * message is safe to show. Anything else is a bug and gets the generic 500.
 */
function clientErrorStatus(error: unknown): number | null {
  if (!(error instanceof Error)) return null

  const status = (error as Error & { status?: unknown }).status
  if (typeof status !== 'number') return null

  return status >= 400 && status <= 499 ? status : null
}

/**
 * `handler` for state-changing routes: verifies the CSRF token before the body
 * is read, so a forged cross-site request never reaches any logic.
 *
 * Every POST/PATCH/PUT/DELETE handler should use this instead of `handler`.
 */
export function mutation(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  return handler(async () => {
    await assertCsrf()
    return fn()
  })
}

/** Parse a JSON body against a schema. Throws ZodError, caught by `handler`. */
export async function parseBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<z.infer<S>> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    throw new z.ZodError([
      { code: 'custom', path: ['_'], message: 'Request body must be valid JSON' },
    ])
  }
  return schema.parse(raw)
}

/** Parse query params against a schema. */
export function parseQuery<S extends z.ZodTypeAny>(request: Request, schema: S): z.infer<S> {
  const url = new URL(request.url)
  return schema.parse(Object.fromEntries(url.searchParams.entries()))
}
