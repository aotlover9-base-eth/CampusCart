import {
  createHash,
  randomBytes,
  randomInt,
  scrypt as scryptCb,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto'
import { promisify } from 'node:util'

// promisify drops the options overload, so restore it explicitly.
const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>

/**
 * Password and token hashing.
 *
 * Uses Node's built-in scrypt - memory-hard, no native compilation, and
 * available on every serverless runtime. Parameters follow current OWASP
 * guidance (N=2^16, r=8, p=1).
 */

const SCRYPT_N = 65_536
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LENGTH = 64
const SALT_LENGTH = 16

/** Hash a password. Returns `scrypt$N$r$p$salt$hash`, all hex. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const derived = (await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 256 * 1024 * 1024,
  })) as Buffer

  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('hex'),
    derived.toString('hex'),
  ].join('$')
}

/**
 * Verify a password against a stored hash. Constant-time, and never throws on
 * a malformed stored value - it just returns false.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  try {
    const parts = stored.split('$')
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false

    const N = Number(parts[1])
    const r = Number(parts[2])
    const p = Number(parts[3])
    const salt = Buffer.from(parts[4] ?? '', 'hex')
    const expected = Buffer.from(parts[5] ?? '', 'hex')
    if (!salt.length || !expected.length) return false

    const derived = (await scrypt(password.normalize('NFKC'), salt, expected.length, {
      N,
      r,
      p,
      maxmem: 256 * 1024 * 1024,
    })) as Buffer

    return derived.length === expected.length && timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}

/**
 * Fast hash for high-volume, low-entropy-independent secrets: refresh tokens,
 * OTP codes, and session identifiers. These are already random with full
 * entropy, so a slow KDF buys nothing - SHA-256 prevents a database leak from
 * yielding usable tokens.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Constant-time comparison of two hex digests. */
export function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex')
  const bufB = Buffer.from(b, 'hex')
  if (bufA.length !== bufB.length || bufA.length === 0) return false
  return timingSafeEqual(bufA, bufB)
}

/** URL-safe random token, used for refresh tokens and admin sessions. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

/**
 * Numeric OTP. Uses randomInt (rejection sampling) rather than modulo on
 * random bytes, so every code is equally likely.
 */
export function generateOtp(digits = 6): string {
  const max = 10 ** digits
  return String(randomInt(0, max)).padStart(digits, '0')
}

/**
 * Hash an IP address for storage. We keep a salted digest so abuse can be
 * correlated without retaining personal data.
 */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null
  const salt = process.env.JWT_ACCESS_SECRET ?? 'campuscart'
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32)
}

/** Stable anonymous fingerprint for view deduplication. */
export function viewerFingerprint(ip: string | null, userAgent: string | null): string {
  return createHash('sha256')
    .update(`${ip ?? 'unknown'}|${userAgent ?? 'unknown'}`)
    .digest('hex')
    .slice(0, 32)
}

/** Random code for referrals and share links - unambiguous characters only. */
export function shortCode(length = 8): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += alphabet[randomInt(0, alphabet.length)]
  }
  return out
}
