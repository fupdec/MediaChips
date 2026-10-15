/**
 * @vitest-environment node
 */
import {describe, expect, it, beforeEach, afterEach, vi} from 'vitest'
import fs from 'fs'
import axios from 'axios'
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
import {checkOAuthClient, validateOAuthClient} from './oauth'
import {DriveConfigurationSchema} from '../../../shared/cloudDrive'
import {MOCK_FILE_SIZE, parseRange} from './mockTransport'
import type {DriveConfig} from './types'
import type {Request, Response} from 'express'

describe('cloudDrive config', () => {
  const envKeys = [
    'MEDIA_CHIPS_DATA_DIR',
    'GOOGLE_OAUTH_CLIENT_ID',
    'GOOGLE_OAUTH_CLIENT_SECRET',
    'GOOGLE_OAUTH_REDIRECT_URI',
    'MEDIA_CHIPS_DRIVE_MOCK',
    'MEDIA_CHIPS_DRIVE_TOKEN_PATH',
  ] as const
  let previous: Record<string, string | undefined>
  let dataDir: string

  beforeEach(() => {
    previous = {}
    for (const key of envKeys) {
      previous[key] = process.env[key]
      delete process.env[key]
    }
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-drive-config-'))
    process.env.MEDIA_CHIPS_DATA_DIR = dataDir
  })

  afterEach(() => {
    fs.rmSync(dataDir, {recursive: true, force: true})
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  })

  it('reports unconfigured without credentials or an explicit mock flag', () => {
    const config = getDriveConfig()
    expect(config.mock).toBe(false)
    expect(config.configured).toBe(false)
    expect(config.scopes[0]).toContain('drive.readonly')
  })

  it('uses live mode when client id/secret are set', () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid'
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'secret'
    const config = getDriveConfig()
    expect(config.mock).toBe(false)
    expect(config.clientId).toBe('cid')
  })

  it('removes pasted spaces and line wraps from environment and saved-form secrets', () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'client'
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = ' GOCSPX- wrap ped\n-key '
    expect(getDriveConfig().clientSecret).toBe('GOCSPX-wrapped-key')
    expect(DriveConfigurationSchema.parse({clientId: 'client', clientSecret: ' GOCSPX- wrap\nped-key ',
      redirectUri: 'http://localhost:12321/api/drive/oauth/callback'}).clientSecret).toBe('GOCSPX-wrapped-key')
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
  it.each([
    ['Movie.wmv', 'video/x-ms-wmv', 'video/x-ms-wmv'],
    ['Movie.mkv', 'application/x-matroska', 'video/x-matroska'],
    ['Movie.WMV', 'application/octet-stream', 'video/x-ms-wmv'],
    ['Movie.m2ts', 'application/octet-stream', 'video/mp2t'],
  ])('streams %s with MIME %s and keeps Range seeking', async (name, mimeType, expectedType) => {
    const transport = createMockDriveTransport()
    vi.spyOn(transport, 'getFileMeta').mockResolvedValue({id: 'movie', name, mimeType, size: 10})
    const bytes = Buffer.from('video')
    const download = vi.spyOn(transport, 'downloadFile').mockResolvedValue({status: 206, headers: {'content-range': 'bytes 0-4/10'}, body: bytes})
    const res = {writeHead: vi.fn(), end: vi.fn()} as unknown as Response
    await streamDriveFile({headers: {range: 'bytes=0-4'}} as Request, res, transport, 'movie')
    expect(download).toHaveBeenCalledWith('movie', 'bytes=0-4', expect.any(AbortSignal))
    expect(res.writeHead).toHaveBeenCalledWith(206, expect.objectContaining({'Content-Type': expectedType, 'Content-Range': 'bytes 0-4/10'}))
    expect(res.end).toHaveBeenCalledWith(bytes)
  })
  it.each([
    ['Movie.wmv', 'application/vnd.google-apps.document'], ['Movie.wmv', 'text/html'],
    ['Movie.html', 'application/octet-stream'],
  ])('rejects non-media content %s with MIME %s', async (name, mimeType) => {
    const transport = createMockDriveTransport()
    vi.spyOn(transport, 'getFileMeta').mockResolvedValue({id: 'document', name, mimeType, size: 10})
    const download = vi.spyOn(transport, 'downloadFile')
    const res = {status: vi.fn().mockReturnThis(), json: vi.fn()} as unknown as Response
    await streamDriveFile({headers: {}} as Request, res, transport, 'document')
    expect(res.status).toHaveBeenCalledWith(415)
    expect(download).not.toHaveBeenCalled()
  })
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


describe('OAuth authorization state', () => {
  let directory: string
  let service: ReturnType<typeof createCloudDriveService>
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-drive-oauth-'))
    service = createCloudDriveService({config: {clientId: 'client', clientSecret: 'secret', mock: false,
      configured: true, scopes: ['https://www.googleapis.com/auth/drive.readonly'],
      redirectUri: 'http://localhost:12321/api/drive/oauth/callback', tokenStorePath: path.join(directory, 'tokens.json')}})
  })
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); fs.rmSync(directory, {recursive: true, force: true}) })
  it('rejects unsolicited callbacks and accepts a generated state only once', async () => {
    const exchange = vi.spyOn(axios, 'post').mockResolvedValue({data: {access_token: 'access', refresh_token: 'refresh'}})
    await expect(service.handleOAuthCallback('code', 'forged')).rejects.toThrow(/expired/)
    expect(exchange).not.toHaveBeenCalled()
    const cancelledState = new URL(service.getAuthUrl()).searchParams.get('state')!
    service.cancelOAuthState(cancelledState)
    await expect(service.handleOAuthCallback('code', cancelledState)).rejects.toThrow(/expired/)
    const state = new URL(service.getAuthUrl()).searchParams.get('state')!
    await service.handleOAuthCallback('code', state)
    expect(service.status().authenticated).toBe(true)
    await expect(service.handleOAuthCallback('code', state)).rejects.toThrow(/expired/)
    expect(exchange).toHaveBeenCalledTimes(1)
    expect(service.status()).not.toHaveProperty('clientSecret')
  })
  it('expires an authorization and invalidates it on disconnect', async () => {
    vi.useFakeTimers()
    const state = new URL(service.getAuthUrl()).searchParams.get('state')!
    vi.advanceTimersByTime(10 * 60_000 + 1)
    await expect(service.handleOAuthCallback('code', state)).rejects.toThrow(/expired/)
    const next = new URL(service.getAuthUrl()).searchParams.get('state')!
    service.logout()
    await expect(service.handleOAuthCallback('code', next)).rejects.toThrow(/expired/)
  })
  it('retries a refused connection but never replays a code after a reset', async () => {
    const post = vi.spyOn(axios, 'post').mockRejectedValueOnce(new axios.AxiosError('Connection refused', 'ECONNREFUSED'))
      .mockResolvedValueOnce({data: {access_token: 'access'}})
    const state = new URL(service.getAuthUrl()).searchParams.get('state')!
    await service.handleOAuthCallback('code', state)
    expect(post).toHaveBeenCalledTimes(2)
    post.mockReset().mockRejectedValue(new axios.AxiosError('Connection reset', 'ECONNRESET'))
    const next = new URL(service.getAuthUrl()).searchParams.get('state')!
    await expect(service.handleOAuthCallback('code', next)).rejects.toThrow()
    expect(post).toHaveBeenCalledTimes(1)
    expect(service.oauthError(next)).toBe('network_error')
  })

  it('does not reconnect after disconnecting during the code exchange', async () => {
    let finish!: (value: unknown) => void
    vi.spyOn(axios, 'post').mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const state = new URL(service.getAuthUrl()).searchParams.get('state')!
    const callback = service.handleOAuthCallback('code', state)
    expect(service.oauthResult(state)).toBe('waiting')
    service.logout()
    finish({data: {access_token: 'late'}})
    await expect(callback).rejects.toThrow(/cancelled/)
    expect(service.status().authenticated).toBe(false)
  })
})


describe('OAuth client preflight', () => {
  const config: DriveConfig = {clientId: 'test-client', clientSecret: 'test-secret', mock: false,
    configured: true, scopes: [], redirectUri: 'http://localhost:12321/api/drive/oauth/callback', tokenStorePath: '/tmp/unused-preflight-tokens.json'}
  afterEach(() => vi.restoreAllMocks())
  it('recognizes invalid_grant for a deliberately fake refresh token as a valid client', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({status: 400, data: {error: 'invalid_grant'}})
    expect(await checkOAuthClient(config)).toEqual({reachable: true, valid: true, status: 400})
    const body = new URLSearchParams(post.mock.calls[0][1] as string)
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe('mediachips-invalid-refresh-token')
    expect(body.has('code')).toBe(false)
    await expect(validateOAuthClient(config)).resolves.toBeUndefined()
  })
  it('rejects a bad secret before sending the user through Google sign-in', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({status: 401, data: {error: 'invalid_client'}})
    expect(await checkOAuthClient(config)).toMatchObject({reachable: true, valid: false, code: 'invalid_client'})
    await expect(validateOAuthClient(config)).rejects.toMatchObject({code: 'invalid_client'})
  })
  it('distinguishes network failures and never includes keys in the result', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(new axios.AxiosError('Request failed', 'ECONNRESET'))
    const result = await checkOAuthClient(config)
    expect(result).toEqual({reachable: false, valid: false, code: 'network_error', networkCode: 'ECONNRESET'})
    expect(JSON.stringify(result)).not.toContain(config.clientSecret)
  })
})
