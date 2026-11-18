import {afterEach, describe, expect, it} from 'vitest'
import {createServer} from 'node:http'
import os from 'node:os'
import path from 'node:path'
import {createExpressApp} from './createApp'
import {registerConfigRoute} from './configRoute'
import {createAuthMiddleware} from './auth'
import type {ServerConfig} from '../types/server'

type TestServer = {
  baseUrl: string
  close: () => Promise<void>
}

async function startServer(authRequired = false, authenticated = false): Promise<TestServer> {
  const {app} = createExpressApp()
  const authService = {
    isAuthRequired: async () => authRequired,
    isRequestAuthenticated: () => authenticated,
  } as unknown as Parameters<typeof createAuthMiddleware>[0]
  if (authRequired) {
    app.use(createAuthMiddleware(authService))
  }

  registerConfigRoute(app, {
    port: 12321,
    databases: [{id: 'db1', name: 'Main', active: true}],
    ips: ['192.168.0.177'],
    hostname: 'mediachips-pc',
    tpdbApiKey: 'tpdb-secret',
  } satisfies ServerConfig, path.join(os.tmpdir(), 'mediachips-config-route'), authService)

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

describe('GET /api/config', () => {
  let server: TestServer | null = null

  afterEach(async () => {
    await server?.close()
    server = null
  })

  it('returns boot config before heavy routes are registered', async () => {
    server = await startServer(false)
    const response = await fetch(server.baseUrl + '/api/config')
    expect(response.ok).toBe(true)
    const body = await response.json() as {port: number; databases: unknown[]}
    expect(body.port).toBe(12321)
    expect(body.databases).toHaveLength(1)
  })

  it('stays available when password protection is on', async () => {
    server = await startServer(true)
    const response = await fetch(server.baseUrl + '/api/config')
    expect(response.status).toBe(200)
    const body = await response.json() as {port: number}
    expect(body.port).toBe(12321)
  })

  it('hides API keys from clients that have not logged in', async () => {
    server = await startServer(true, false)
    const body = await (await fetch(server.baseUrl + '/api/config')).json() as {tpdbApiKey: string}
    expect(body.tpdbApiKey).toBe('')
  })

  it('returns API keys after login', async () => {
    server = await startServer(true, true)
    const body = await (await fetch(server.baseUrl + '/api/config')).json() as {tpdbApiKey: string}
    expect(body.tpdbApiKey).toBe('tpdb-secret')
  })

  it('returns API keys when password protection is off', async () => {
    server = await startServer(false)
    const body = await (await fetch(server.baseUrl + '/api/config')).json() as {tpdbApiKey: string}
    expect(body.tpdbApiKey).toBe('tpdb-secret')
  })
})
