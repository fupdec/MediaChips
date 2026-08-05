/**
 * @vitest-environment node
 */
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import type {AddressInfo} from 'net'
import {afterEach, describe, expect, it} from 'vitest'
import {downloadHttpFile, downloadHttpFileWithRetries} from './httpFileDownload'

describe('httpFileDownload', () => {
  const servers: http.Server[] = []
  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
      server.close(() => resolve())
    })))
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, {recursive: true, force: true})
    }
  })

  function tmpDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'http-dl-'))
    tempDirs.push(dir)
    return dir
  }

  async function listen(
    handler: http.RequestListener,
  ): Promise<{baseUrl: string; server: http.Server}> {
    const server = http.createServer(handler)
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const {port} = server.address() as AddressInfo
    return {baseUrl: `http://127.0.0.1:${port}`, server}
  }

  it('writes the file atomically and cleans the temp suffix', async () => {
    const {baseUrl} = await listen((_req, res) => {
      res.writeHead(200, {'Content-Length': '5'})
      res.end('hello')
    })
    const dest = path.join(tmpDir(), 'out.bin')
    await downloadHttpFile(`${baseUrl}/file`, dest, {errorLabel: 'test file'})
    expect(fs.readFileSync(dest, 'utf8')).toBe('hello')
    expect(fs.existsSync(`${dest}.download`)).toBe(false)
  })

  it('follows redirects within the cap', async () => {
    const {baseUrl} = await listen((req, res) => {
      if (req.url === '/a') {
        res.writeHead(302, {Location: `${baseUrl}/b`})
        res.end()
        return
      }
      res.writeHead(200)
      res.end('ok')
    })
    const dest = path.join(tmpDir(), 'redir.bin')
    await downloadHttpFile(`${baseUrl}/a`, dest)
    expect(fs.readFileSync(dest, 'utf8')).toBe('ok')
  })

  it('rejects non-200 with the error label', async () => {
    const {baseUrl} = await listen((_req, res) => {
      res.writeHead(404)
      res.end('missing')
    })
    const dest = path.join(tmpDir(), 'missing.bin')
    await expect(downloadHttpFile(`${baseUrl}/x`, dest, {errorLabel: 'face model'}))
      .rejects.toThrow('Failed to download face model (HTTP 404)')
  })

  it('honors abort mid-stream', async () => {
    const signal = {aborted: false}
    const {baseUrl} = await listen((_req, res) => {
      res.writeHead(200, {'Content-Length': '1000000'})
      const chunk = Buffer.alloc(64 * 1024, 1)
      const write = () => {
        if (!res.write(chunk)) {
          res.once('drain', write)
          return
        }
        if (!signal.aborted) setImmediate(write)
      }
      write()
    })
    const dest = path.join(tmpDir(), 'abort.bin')
    const pending = downloadHttpFile(`${baseUrl}/big`, dest, {
      signal,
      onProgress: () => {
        signal.aborted = true
      },
    })
    await expect(pending).rejects.toThrow('aborted')
    expect(fs.existsSync(dest)).toBe(false)
  })

  it('rejects downloads below minBytes', async () => {
    const {baseUrl} = await listen((_req, res) => {
      res.writeHead(200)
      res.end('tiny')
    })
    const dest = path.join(tmpDir(), 'tiny.bin')
    await expect(downloadHttpFile(`${baseUrl}/tiny`, dest, {
      errorLabel: 'Real-ESRGAN package',
      minBytes: 1024,
    })).rejects.toThrow(/too small/)
  })

  it('reports increasing progress', async () => {
    const {baseUrl} = await listen((_req, res) => {
      res.writeHead(200, {'Content-Length': '6'})
      res.write('abc')
      res.end('def')
    })
    const loaded: number[] = []
    const dest = path.join(tmpDir(), 'progress.bin')
    await downloadHttpFile(`${baseUrl}/p`, dest, {
      onProgress: (value) => loaded.push(value),
    })
    expect(loaded.at(-1)).toBe(6)
    expect(loaded[0]).toBeGreaterThan(0)
  })

  it('retries transient failures then succeeds', async () => {
    let hits = 0
    const {baseUrl} = await listen((_req, res) => {
      hits += 1
      if (hits === 1) {
        res.destroy()
        return
      }
      res.writeHead(200)
      res.end('recovered')
    })
    const dest = path.join(tmpDir(), 'retry.bin')
    await downloadHttpFileWithRetries(`${baseUrl}/r`, dest, {
      errorLabel: 'retry file',
      attempts: 3,
      retryDelayMs: 1,
    })
    expect(fs.readFileSync(dest, 'utf8')).toBe('recovered')
    expect(hits).toBeGreaterThan(1)
  })
})
