import {afterEach, describe, expect, it} from 'vitest'
import {createServer} from 'node:http'
import {createExpressApp} from './createApp'
import {createAuthMiddleware} from './auth'

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
