import {afterEach, describe, expect, it} from 'vitest'
import {createServer} from 'node:http'
import {createExpressApp} from './createApp'
import {createAuthMiddleware, createLoginThrottle, isProtectedWsPath, isSecretSettingOption, safeEqual} from './auth'

type TestServer = {
  baseUrl: string
  close: () => Promise<void>
}

async function startServer(): Promise<TestServer> {
  const {app} = createExpressApp()
  const authService = {
    isAuthRequired: async () => true,
    isRequestAuthenticated: () => false,
  } as unknown as Parameters<typeof createAuthMiddleware>[0]
  app.use(createAuthMiddleware(authService))
  app.get('/api/config', (_req, res) => res.json({ok: true}))
  app.get('/api/setting', (_req, res) => res.json({ok: true}))
  app.get('/api/tags', (_req, res) => res.json({ok: true}))
  app.get('/moving/.websocket', (_req, res) => res.json({ok: true}))

  const server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Failed to resolve test server port')

  return {
    baseUrl: 'http://127.0.0.1:' + address.port,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    }),
  }
}

describe('auth middleware public paths', () => {
  let server: TestServer | null = null

  afterEach(async () => {
    await server?.close()
    server = null
  })

  it('lets the SPA fetch /api/config without a session', async () => {
    server = await startServer()
    const response = await fetch(server.baseUrl + '/api/config')
    expect(response.status).toBe(200)
  })

  it('still protects library routes', async () => {
    server = await startServer()
    const response = await fetch(server.baseUrl + '/api/tags')
    expect(response.status).toBe(401)
  })
})

describe('auth middleware websocket routes', () => {
  let server: TestServer | null = null

  afterEach(async () => {
    await server?.close()
    server = null
  })

  it('protects the express-ws upgrade path for /moving', async () => {
    server = await startServer()
    const response = await fetch(server.baseUrl + '/moving/.websocket')
    expect(response.status).toBe(401)
  })

  it('recognizes websocket routes with and without the express-ws suffix', () => {
    expect(isProtectedWsPath('/moving')).toBe(true)
    expect(isProtectedWsPath('/watcher/.websocket?token=x')).toBe(true)
    expect(isProtectedWsPath('/Moving/.websocket')).toBe(true)
    expect(isProtectedWsPath('/movingfoo')).toBe(false)
    expect(isProtectedWsPath('/assets/app.js')).toBe(false)
  })
})

describe('login hardening', () => {
  it('compares passwords in constant time without length leaks', () => {
    expect(safeEqual('secret', 'secret')).toBe(true)
    expect(safeEqual('secret', 'secreT')).toBe(false)
    expect(safeEqual('', 'secret')).toBe(false)
  })

  it('locks a client out after repeated failures and unlocks after the window', () => {
    let clock = 0
    const throttle = createLoginThrottle({windowMs: 1000, maxFailures: 3, now: () => clock})
    for (let i = 0; i < 3; i += 1) throttle.recordFailure('1.2.3.4')
    expect(throttle.retryAfterMs('1.2.3.4')).toBe(1000)
    expect(throttle.retryAfterMs('5.6.7.8')).toBe(0)
    clock = 1001
    expect(throttle.retryAfterMs('1.2.3.4')).toBe(0)
  })

  it('clears failures after a successful login', () => {
    const throttle = createLoginThrottle({maxFailures: 2})
    throttle.recordFailure('a')
    throttle.reset('a')
    throttle.recordFailure('a')
    expect(throttle.retryAfterMs('a')).toBe(0)
  })
})

describe('secret settings', () => {
  it('treats the password and third-party credentials as secret', () => {
    for (const option of ['phrase', 'tmdbApiKey', 'tpdbApiKey', 'jellyfinApiKey', 'plexToken', 'clientSecret']) {
      expect(isSecretSettingOption(option)).toBe(true)
    }
  })

  it('keeps login-screen settings readable', () => {
    for (const option of ['passwordProtection', 'passwordHint', 'theme', 'tmdbPersonMetaId']) {
      expect(isSecretSettingOption(option)).toBe(false)
    }
  })
})
