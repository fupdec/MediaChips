/**
 * @vitest-environment node
 */
import {describe, expect, it, beforeEach, afterEach} from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  buildAuthUrl,
  createCloudDriveService,
  createMockDriveTransport,
  createTokenStore,
  getDriveConfig,
  resetCloudDriveServiceForTests,
  streamDriveFile,
} from './index'
import {MOCK_FILE_SIZE, parseRange} from './mockTransport'
import type {DriveConfig} from './types'
import type {Request, Response} from 'express'

describe('cloudDrive config', () => {
  const envKeys = [
    'GOOGLE_OAUTH_CLIENT_ID',
    'GOOGLE_OAUTH_CLIENT_SECRET',
    'GOOGLE_OAUTH_REDIRECT_URI',
    'MEDIA_CHIPS_DRIVE_MOCK',
    'MEDIA_CHIPS_DRIVE_TOKEN_PATH',
  ] as const
  let previous: Record<string, string | undefined>

  beforeEach(() => {
    previous = {}
    for (const key of envKeys) {
      previous[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  })

  it('defaults to mock when credentials are missing', () => {
    const config = getDriveConfig()
    expect(config.mock).toBe(true)
    expect(config.configured).toBe(true)
    expect(config.scopes[0]).toContain('drive.readonly')
  })

  it('uses live mode when client id/secret are set', () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid'
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'secret'
    const config = getDriveConfig()
    expect(config.mock).toBe(false)
    expect(config.clientId).toBe('cid')
  })

  it('forces mock when MEDIA_CHIPS_DRIVE_MOCK=1', () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid'
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'secret'
    process.env.MEDIA_CHIPS_DRIVE_MOCK = '1'
    expect(getDriveConfig().mock).toBe(true)
  })
})

describe('oauth helpers', () => {
  it('builds Google auth URL with offline access', () => {
    const config: DriveConfig = {
      clientId: 'test-client',
      clientSecret: 'secret',
      redirectUri: 'http://localhost:3000/api/drive/oauth/callback',
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
      mock: false,
      configured: true,
      tokenStorePath: '/tmp/x.json',
    }
    const url = buildAuthUrl(config, 'spike')
    expect(url).toContain('accounts.google.com')
    expect(url).toContain('client_id=test-client')
    expect(url).toContain('access_type=offline')
    expect(url).toContain('state=spike')
    expect(url).toContain(encodeURIComponent(config.redirectUri))
  })
})

describe('token store', () => {
  it('persists and clears tokens on disk', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-tokens-'))
    const filePath = path.join(dir, 'tokens.json')
    const store = createTokenStore(filePath)
    store.set({accessToken: 'a', refreshToken: 'r', expiryDate: Date.now() + 60_000})
    expect(fs.existsSync(filePath)).toBe(true)
    expect(createTokenStore(filePath).get()?.accessToken).toBe('a')
    store.clear()
    expect(fs.existsSync(filePath)).toBe(false)
  })
})

describe('mock transport + Range proxy', () => {
  it('lists a folder with a sample video', async () => {
    const transport = createMockDriveTransport()
    const listed = await transport.listFolder('root')
    expect(listed.mock).toBe(true)
    expect(listed.files.some((f) => f.id === 'mock-video-sample')).toBe(true)
  })

  it('parses byte ranges', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({start: 0, end: 99})
    expect(parseRange('bytes=10-', 100)).toEqual({start: 10, end: 99})
    expect(parseRange(undefined, 100)).toBeNull()
  })

  it('streams a partial Range response', async () => {
    const transport = createMockDriveTransport()
    const service = createCloudDriveService({
      config: {
        clientId: '',
        clientSecret: '',
        redirectUri: 'http://localhost:3000/api/drive/oauth/callback',
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
        mock: true,
        configured: true,
        tokenStorePath: path.join(os.tmpdir(), 'unused-drive-tokens.json'),
      },
      transport,
    })

    const chunks: Buffer[] = []
    let statusCode = 0
    let headers: Record<string, string | number> = {}
    const res = {
      writeHead(code: number, head: Record<string, string | number>) {
        statusCode = code
        headers = head
      },
      end(buf?: Buffer) {
        if (buf) chunks.push(Buffer.from(buf))
      },
      destroy() {},
      headersSent: false,
      status() {
        return this
      },
      json() {},
    } as unknown as Response

    const req = {
      headers: {range: 'bytes=0-99'},
      on() {},
    } as unknown as Request

    await streamDriveFile(req, res, service.transport, 'mock-video-sample')

    expect(statusCode).toBe(206)
    expect(String(headers['Content-Range'])).toBe(`bytes 0-99/${MOCK_FILE_SIZE}`)
    expect(Buffer.concat(chunks).length).toBe(100)
  })
})

describe('createCloudDriveService mock mode', () => {
  afterEach(() => {
    resetCloudDriveServiceForTests()
  })

  it('reports authenticated in mock mode and lists folders', async () => {
    const service = createCloudDriveService({
      config: {
        clientId: '',
        clientSecret: '',
        redirectUri: 'http://localhost:3000/api/drive/oauth/callback',
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
        mock: true,
        configured: true,
        tokenStorePath: path.join(os.tmpdir(), 'unused-drive-tokens-2.json'),
      },
      transport: createMockDriveTransport(),
    })
    expect(service.status().authenticated).toBe(true)
    expect(service.status().mock).toBe(true)
    const listed = await service.listFolder('root')
    expect(listed.files.length).toBeGreaterThan(0)
    expect(() => service.getAuthUrl()).toThrow(/mock mode/i)
  })
})
