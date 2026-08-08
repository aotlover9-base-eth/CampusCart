'use client'

import type { ApiResponse } from '@/lib/api'

/**
 * The single entry point for client → API calls.
 *
 * Handles three things every caller would otherwise repeat: attaching the CSRF
 * header on writes, unwrapping the `{ ok, data }` envelope, and transparently
 * refreshing an expired access token once before giving up.
 */

const CSRF_HEADER = 'x-csrf-token'
const CSRF_COOKIE = 'cc_csrf'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fields?: Record<string, string>,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function readCsrfToken(): string | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${CSRF_COOKIE}=([^;]*)`),
  )
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  /** Set false to skip the refresh-and-retry on a 401. */
  retryOnAuthFailure?: boolean
}

/**
 * Perform a request and return `data` on success, throwing ApiError otherwise.
 * Callers get plain values and can use try/catch instead of branching on `ok`.
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, retryOnAuthFailure = true, headers: extraHeaders, ...rest } = options
  const method = (rest.method ?? 'GET').toUpperCase()

  const headers = new Headers(extraHeaders)
  const isWrite = method !== 'GET' && method !== 'HEAD'

  // FormData sets its own multipart boundary, so never override Content-Type.
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  if (body !== undefined && !isFormData) {
    headers.set('Content-Type', 'application/json')
  }

  if (isWrite) {
    const token = readCsrfToken()
    if (token) headers.set(CSRF_HEADER, token)
  }

  const response = await fetch(path, {
    ...rest,
    method,
    headers,
    credentials: 'same-origin',
    body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
  })

  // A 401 usually means the 15-minute access token lapsed while the tab sat
  // open. Rotate it and replay the request once.
  if (response.status === 401 && retryOnAuthFailure) {
    const refreshed = await refreshSession()
    if (refreshed) {
      return api<T>(path, { ...options, retryOnAuthFailure: false })
    }
  }

  let payload: ApiResponse<T>
  try {
    payload = (await response.json()) as ApiResponse<T>
  } catch {
    throw new ApiError(
      response.ok ? 'The server sent an unreadable response.' : response.statusText,
      response.status,
    )
  }

  if (!payload.ok) {
    throw new ApiError(payload.error, response.status, payload.fields)
  }

  return payload.data
}

/** Rotate the access token. Returns false when the refresh token is also dead. */
export async function refreshSession(): Promise<boolean> {
  try {
    const token = readCsrfToken()
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'same-origin',
      headers: token ? { [CSRF_HEADER]: token } : undefined,
    })
    return response.ok
  } catch {
    return false
  }
}

/** Build a query string, dropping empty and nullish values. */
export function queryString(params: Record<string, unknown>): string {
  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '' || value === false) continue
    if (Array.isArray(value)) {
      if (value.length > 0) search.set(key, value.join(','))
      continue
    }
    search.set(key, String(value))
  }

  const encoded = search.toString()
  return encoded ? `?${encoded}` : ''
}
