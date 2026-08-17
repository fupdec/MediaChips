import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import express from 'express'
import { createServer } from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setupStaticApp } from './createApp'

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {Accept: 'text/html,application/xhtml+xml'},
  })

  return {
    status: response.status,
    text: await response.text(),
  }
}

let staticDir = ''

beforeEach(() => {
  staticDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediachips-static-'))
  fs.mkdirSync(path.join(staticDir, 'assets'), {recursive: true})
  fs.writeFileSync(
    path.join(staticDir, 'index.html'),
    '<!DOCTYPE html><html><body><div id="app">MediaChips</div><script src="./assets/app.js"></script></body></html>',
  )
  fs.writeFileSync(path.join(staticDir, 'assets', 'app.js'), 'console.log("app")')
})

afterEach(() => {
  fs.rmSync(staticDir, {recursive: true, force: true})
})

describe('setupStaticApp', () => {
  it('serves index.html for client-side routes', async () => {
    const app = express()
    setupStaticApp(app, staticDir)

    const server = createServer(app)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Failed to resolve test server port')
    }

    try {
      const baseUrl = `http://127.0.0.1:${address.port}`
      const home = await fetchText(`${baseUrl}/`)
      const settings = await fetchText(`${baseUrl}/settings`)

      expect(home.status).toBe(200)
      expect(home.text).toMatch(/MediaChips|id="app"/)
      expect(settings.status).toBe(200)
      expect(settings.text).toMatch(/MediaChips|id="app"/)
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    }
  })

  it('does not strip query strings from /api/get-file when static is mounted', async () => {
    const app = express()
    app.get('/api/get-file', (req, res) => {
      res.json({url: req.query.url ?? null})
    })
    setupStaticApp(app, staticDir)

    const server = createServer(app)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Failed to resolve test server port')
    }

    try {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/get-file?url=${encodeURIComponent('meta/1_main.jpg')}`,
      )
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({url: 'meta/1_main.jpg'})
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    }
  })

  it('serves built assets without SPA fallback', async () => {
    const app = express()
    setupStaticApp(app, staticDir)

    const server = createServer(app)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Failed to resolve test server port')
    }

    try {
      const indexHtml = await fetch(`http://127.0.0.1:${address.port}/`)
      const html = await indexHtml.text()
      const scriptMatch = html.match(/src="(\.\/)?(assets\/[^"]+\.js)"/)
      expect(scriptMatch?.[2] ?? scriptMatch?.[1]).toBeTruthy()

      const assetPath = (scriptMatch?.[2] ?? scriptMatch?.[1] ?? '').replace(/^\.\//, '')
      const assetResponse = await fetch(`http://127.0.0.1:${address.port}/${assetPath}`, {
        headers: {Accept: '*/*'},
      })

      expect(assetResponse.status).toBe(200)
      expect(assetResponse.headers.get('content-type')).toMatch(/javascript|ecmascript|text\/javascript/)
      expect(await assetResponse.text()).not.toMatch(/^<!DOCTYPE html>/)
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    }
  })
})
