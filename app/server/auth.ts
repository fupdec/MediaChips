import type { ApiDb } from '../../api/types/db'
import type { Express, Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import { createSettingsRepository } from '../../api/db/repositories/settings'
import { validateBody } from '../../api/middleware/validateBody'
import { AuthLoginRequestSchema } from '../../shared/schemas/requests'

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const SETTINGS_CACHE_MS = 10_000

interface Session {
  createdAt: number
  expiresAt: number
}

interface SecuritySettings {
  passwordProtection: boolean
  phrase: string
}

interface SettingRow {
  option: string
  value: string
}

type AuthService = ReturnType<typeof createAuthService>

/** Constant-time compare; hashing first equalizes lengths for timingSafeEqual. */
function safeEqual(a: string, b: string): boolean {
  const left = crypto.createHash('sha256').update(a, 'utf8').digest()
  const right = crypto.createHash('sha256').update(b, 'utf8').digest()
  return crypto.timingSafeEqual(left, right)
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_MAX_FAILURES = 10

/** Per-client failed-login counter so the password can't be brute-forced over LAN. */
function createLoginThrottle({windowMs = LOGIN_WINDOW_MS, maxFailures = LOGIN_MAX_FAILURES, now = Date.now} = {}) {
  const failures = new Map<string, {count: number; resetAt: number}>()

  function entry(key: string) {
    const current = failures.get(key)
    if (current && now() < current.resetAt) return current
    failures.delete(key)
    return null
  }

  return {
    /** Milliseconds until the client may try again, or 0 when allowed. */
    retryAfterMs(key: string): number {
      const current = entry(key)
      return current && current.count >= maxFailures ? current.resetAt - now() : 0
    },
    recordFailure(key: string) {
      const current = entry(key)
      if (current) current.count += 1
      else failures.set(key, {count: 1, resetAt: now() + windowMs})
    },
    reset(key: string) {
      failures.delete(key)
    },
  }
}

function clientKey(req: Request): string {
  return req.ip || req.socket?.remoteAddress || 'unknown'
}

function createAuthService(db: ApiDb) {
  const sessions = new Map<string, Session>()
  let settingsCache: { at: number; settings: SecuritySettings } | null = null

  function invalidateSettingsCache() {
    settingsCache = null
  }

  async function loadSecuritySettings(): Promise<SecuritySettings> {
    if (settingsCache && Date.now() - settingsCache.at < SETTINGS_CACHE_MS) {
      return settingsCache.settings
    }

    const rows = createSettingsRepository(db.drizzle).findAll() as SettingRow[]
    const map = Object.fromEntries(rows.map((row) => [row.option, row.value]))
    const settings = {
      passwordProtection: map.passwordProtection === '1',
      phrase: map.phrase || '',
    }

    settingsCache = {at: Date.now(), settings}
    return settings
  }

  function createSession(): string {
    const token = crypto.randomBytes(32).toString('hex')
    const now = Date.now()
    sessions.set(token, {createdAt: now, expiresAt: now + SESSION_TTL_MS})
    return token
  }

  function validateToken(token: string | undefined | null): boolean {
    if (!token) return false

    const session = sessions.get(token)
    if (!session) return false

    if (Date.now() > session.expiresAt) {
      sessions.delete(token)
      return false
    }

    return true
  }

  function revokeToken(token: string) {
    sessions.delete(token)
  }

  async function isAuthRequired(): Promise<boolean> {
    const settings = await loadSecuritySettings()
    return settings.passwordProtection
  }

  async function verifyPassword(password: string): Promise<boolean> {
    const settings = await loadSecuritySettings()
    if (!settings.passwordProtection) return true
    return safeEqual(password, settings.phrase)
  }

  function extractToken(req: Request): string | null {
    const authHeader = req.headers.authorization
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim()
    }

    const queryToken = req.query?.token
    if (typeof queryToken === 'string' && queryToken.trim()) {
      return queryToken.trim()
    }
    if (Array.isArray(queryToken) && typeof queryToken[0] === 'string' && queryToken[0].trim()) {
      return queryToken[0].trim()
    }

    return null
  }

  function isRequestAuthenticated(req: Request): boolean {
    return validateToken(extractToken(req))
  }

  function sanitizeSettingRows(
    rows: SettingRow[],
    passwordProtection: boolean,
    authenticated: boolean,
  ): SettingRow[] {
    if (!passwordProtection || authenticated) return rows

    return rows.map((row) =>
      row.option === 'phrase' ? {...row, value: ''} : row,
    )
  }

  function sanitizeSettingRow(
    row: SettingRow | null,
    passwordProtection: boolean,
    authenticated: boolean,
  ): SettingRow | null {
    if (!row) return row
    if (!passwordProtection || authenticated) return row
    if (row.option === 'phrase') return {...row, value: ''}
    return row
  }

  setInterval(() => {
    const now = Date.now()
    for (const [token, session] of sessions) {
      if (now > session.expiresAt) {
        sessions.delete(token)
      }
    }
  }, 60 * 60 * 1000).unref()

  return {
    invalidateSettingsCache,
    loadSecuritySettings,
    createSession,
    validateToken,
    revokeToken,
    isAuthRequired,
    verifyPassword,
    extractToken,
    isRequestAuthenticated,
    sanitizeSettingRows,
    sanitizeSettingRow,
  }
}

const PUBLIC_PATHS = new Set([
  '/api/health',
  '/api/ping',
  '/api/config',
  '/api/clear-cache',
  '/api/auth/login',
  '/api/auth/status',
  '/api/auth/logout',
  '/api/setting',
  // Google OAuth redirect lands here without a MediaChips session cookie.
  '/api/drive/oauth/callback',
  '/api/cloud-accounts/oauth/callback',
])

function isPublicApiPath(url: string): boolean {
  const path = url.split('?')[0].toLowerCase()
  return PUBLIC_PATHS.has(path)
}

// WebSocket routes live outside /api/ but can move/rename files on disk, so they
// must pass the same session check. express-ws rewrites the upgrade URL to
// `/<route>/.websocket` before it reaches the middleware stack.
const PROTECTED_WS_PATHS = ['/moving', '/watcher']

function isProtectedWsPath(url: string): boolean {
  const path = url.split('?')[0].toLowerCase()
  return PROTECTED_WS_PATHS.some((wsPath) => path === wsPath || path.startsWith(wsPath + '/'))
}

function requiresAuthCheck(url: string): boolean {
  return url.startsWith('/api/') || isProtectedWsPath(url)
}

function createAuthMiddleware(authService: AuthService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const url = req.url || ''
    if (!requiresAuthCheck(url)) return next()
    if (req.method === 'OPTIONS') return next()
    if (isPublicApiPath(url)) return next()

    try {
      const required = await authService.isAuthRequired()
      if (!required) return next()

      if (authService.isRequestAuthenticated(req)) return next()

      return res.status(401).json({message: 'Authentication required'})
    } catch (err) {
      next(err)
    }
  }
}

function registerAuthRoutes(app: Express, authService: AuthService, throttle = createLoginThrottle()) {
  app.get('/api/auth/status', async (req: Request, res: Response) => {
    try {
      const required = await authService.isAuthRequired()
      res.json({
        required,
        authenticated: authService.isRequestAuthenticated(req),
      })
    } catch (_err: unknown) {
      res.status(500).json({message: 'Failed to read auth status'})
    }
  })

  app.post('/api/auth/login', validateBody(AuthLoginRequestSchema), async (req: Request, res: Response) => {
    try {
      const required = await authService.isAuthRequired()
      const password = req.body?.password

      if (!required) {
        const token = authService.createSession()
        return res.json({token, required: false})
      }

      if (typeof password !== 'string') {
        return res.status(400).json({message: 'Password required'})
      }

      const key = clientKey(req)
      const waitMs = throttle.retryAfterMs(key)
      if (waitMs > 0) {
        res.setHeader('Retry-After', String(Math.ceil(waitMs / 1000)))
        return res.status(429).json({message: 'Too many failed attempts. Try again later.'})
      }

      const valid = await authService.verifyPassword(password)
      if (!valid) {
        throttle.recordFailure(key)
        return res.status(401).json({message: 'Invalid password'})
      }

      throttle.reset(key)
      const token = authService.createSession()
      res.json({token, required: true})
    } catch (_err: unknown) {
      res.status(500).json({message: 'Login failed'})
    }
  })

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const token = authService.extractToken(req)
    if (token) authService.revokeToken(token)
    res.json({success: true})
  })
}

export { createAuthService, createAuthMiddleware, registerAuthRoutes, isProtectedWsPath, createLoginThrottle, safeEqual }
