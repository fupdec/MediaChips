import crypto from 'crypto'

/**
 * Password storage for the app lock / LAN login. Stored form:
 *   scrypt$<N>$<r>$<p>$<salt b64>$<hash b64>
 * Older installs kept the password in plain text; verifyStoredPassword still
 * accepts that so existing users can log in, and callers rehash on success.
 */

const PREFIX = 'scrypt'
const N = 16384
const R = 8
const P = 1
const KEY_LENGTH = 32
const SALT_BYTES = 16

function scrypt(password: string, salt: Buffer, n: number, r: number, p: number, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keyLength, {N: n, r, p, maxmem: 128 * n * r * 2}, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
}

export function isPasswordHash(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX + '$') && value.split('$').length === 6
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_BYTES)
  const key = await scrypt(password, salt, N, R, P, KEY_LENGTH)
  return [PREFIX, N, R, P, salt.toString('base64'), key.toString('base64')].join('$')
}

/** Constant-time compare; hashing first equalizes lengths for timingSafeEqual. */
export function safeEqual(a: string, b: string): boolean {
  const left = crypto.createHash('sha256').update(a, 'utf8').digest()
  const right = crypto.createHash('sha256').update(b, 'utf8').digest()
  return crypto.timingSafeEqual(left, right)
}

export async function verifyStoredPassword(password: string, stored: string): Promise<boolean> {
  if (!isPasswordHash(stored)) return safeEqual(password, stored)

  const [, n, r, p, saltB64, hashB64] = stored.split('$')
  const expected = Buffer.from(hashB64, 'base64')
  const params = [Number(n), Number(r), Number(p)]
  if (!expected.length || params.some((value) => !Number.isInteger(value) || value <= 0)) return false

  try {
    const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), params[0], params[1], params[2], expected.length)
    return crypto.timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
