import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {RotatingLogFile} from './appLog'
import {registerLogRoutes} from './logRoute'

type Handler = (req: unknown, res: unknown) => void

function setup(resolveDir: () => string | null) {
  const handlers = new Map<string, Handler>()
  registerLogRoutes({get: (route: string, handler: Handler) => handlers.set(route, handler)} as never, resolveDir)
  const call = (route: string, query: Record<string, unknown> = {}) => {
    const out: {status: number; body: unknown; headers: Record<string, string>} = {status: 200, body: undefined, headers: {}}
    const res = {
      status(code: number) { out.status = code; return res },
      json(body: unknown) { out.body = body },
      send(body: unknown) { out.body = body },
      setHeader(name: string, value: string) { out.headers[name] = value },
    }
    handlers.get(route)!({query}, res)
    return out
  }
  return call
}

let dir: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-logroute-')) })
afterEach(() => { fs.rmSync(dir, {recursive: true, force: true}) })

describe('log routes', () => {
  it('rejects unknown sources', () => {
    const call = setup(() => dir)
    expect(call('/api/logs', {source: '../secret'}).status).toBe(400)
    expect(call('/api/logs/download', {source: 'x'}).status).toBe(400)
  })

  it('returns an unavailable payload before the log dir is attached', () => {
    const call = setup(() => null)
    expect(call('/api/logs').body).toMatchObject({available: false, lines: []})
  })

  it('serves the tail and scrubs secrets that an older build wrote', () => {
    const log = new RotatingLogFile(dir, 'server')
    log.write('a\n')
    log.write('GET /x?token=SECRET\n')
    log.flush()
    const call = setup(() => dir)
    const body = call('/api/logs', {source: 'server', lines: '1'}).body as {lines: string[]; available: boolean}
    expect(body.available).toBe(true)
    expect(body.lines).toEqual(['GET /x?token=[redacted]'])
  })

  it('downloads the whole log as an attachment', () => {
    const log = new RotatingLogFile(dir, 'main')
    log.write('hello\n')
    log.flush()
    const call = setup(() => dir)
    const res = call('/api/logs/download', {source: 'main'})
    expect(res.body).toBe('hello\n')
    expect(res.headers['Content-Disposition']).toContain('mediachips-main.log.txt')
    expect(call('/api/logs/download', {source: 'server'}).status).toBe(404)
  })
})
