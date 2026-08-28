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

async function startServer(authRequired = false): Promise<TestServer> {
  const {app} = createExpressApp()
  if (authRequired) {
    const authService = {
      isAuthRequired: async () => true,
      isRequestAuthenticated: () => false,
    } as Parameters<typeof createAuthMiddleware>[0]
    app.use(createAuthMiddleware(authService))
  }

  registerConfigRoute(app, {
    port: 12321,
    databases: [{id: 'db1', name: 'Main', active: true}],
    ips: ['192.168.0.177'],
    hostname: 'mediachips-pc',
  } satisfies ServerConfig, path.join(os.tmpdir(), 'mediachips-config-route'))

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
})
