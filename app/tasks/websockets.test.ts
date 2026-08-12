import {afterEach, describe, expect, it, vi} from 'vitest'
import express from 'express'
import type {AddressInfo} from 'net'
import type {Server} from 'http'
import WebSocket from 'ws'

vi.mock('./movingWsHandler', () => ({
  registerMovingWebSocket: (app: {ws: (route: string, handler: (ws: WebSocket) => void) => void}) => {
    app.ws('/moving', (ws) => {
      ws.send(JSON.stringify({type: 'ready'}))
    })
  },
}))

vi.mock('./watcherWsHandler', () => ({
  registerWatcherWebSocket: vi.fn(),
}))

import registerWebSockets, {
  attachWebSocketsToServer,
  resetWebSocketsForTests,
} from './websockets'

function listen(app: express.Express): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server))
    server.on('error', reject)
  })
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()))
  })
}

function openWs(url: string, timeoutMs = 3000): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    const timer = setTimeout(() => {
      try { ws.close() } catch { /* ignore */ }
      reject(new Error(`WebSocket connect timed out: ${url}`))
    }, timeoutMs)

    ws.once('open', () => {
      clearTimeout(timer)
      resolve(ws)
    })
    ws.once('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

describe('registerWebSockets after listen', () => {
  afterEach(() => {
    resetWebSocketsForTests()
  })

  it('accepts /moving upgrades when expressWs is bound to the live listener', async () => {
    const app = express()
    const server = await listen(app)
    const {port} = server.address() as AddressInfo

    registerWebSockets(app, {drizzle: {}} as never, server)

    const message = await new Promise<string>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/moving`)
      const timer = setTimeout(() => {
        try { ws.close() } catch { /* ignore */ }
        reject(new Error('WebSocket ready message timed out'))
      }, 3000)
      ws.once('message', (data) => {
        clearTimeout(timer)
        ws.close()
        resolve(String(data))
      })
      ws.once('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
    })

    expect(JSON.parse(message)).toEqual({type: 'ready'})
    await closeServer(server)
  })

  it('rebinding to a new listener keeps /moving reachable', async () => {
    const app = express()
    const first = await listen(app)
    registerWebSockets(app, {drizzle: {}} as never, first)
    await closeServer(first)

    const second = await listen(app)
    attachWebSocketsToServer(app, second)
    const {port} = second.address() as AddressInfo

    const ws = await openWs(`ws://127.0.0.1:${port}/moving`)
    expect(ws.readyState).toBe(WebSocket.OPEN)
    ws.close()
    await closeServer(second)
  })
})
