import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import { apiClient, buildApiUrl, getApiBaseUrl } from '@/services/apiClient'

vi.mock('@/services/authSession', () => ({
  getAuthToken: vi.fn(() => null),
  clearAuthToken: vi.fn(),
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({
    localhost: 'http://127.0.0.1:12321',
    config: { ip: 'localhost', port: 12321 },
    isLocked: false,
  }),
}))

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => ({
    passwordProtection: '0',
  }),
}))

import { clearAuthToken, getAuthToken } from '@/services/authSession'

const mockGetAuthToken = vi.mocked(getAuthToken)

describe('apiClient helpers', () => {
  const appStore = {
    localhost: 'http://127.0.0.1:12321',
    config: { ip: 'localhost', port: 12321 },
  }

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('builds api urls from relative paths', () => {
    expect(buildApiUrl('/api/Media/items', 'http://localhost:12321'))
      .toBe('http://localhost:12321/api/Media/items')
    expect(buildApiUrl('api/ping', 'http://localhost:12321/'))
      .toBe('http://localhost:12321/api/ping')
  })

  it('returns absolute urls unchanged', () => {
    expect(buildApiUrl('https://example.com/api/ping', 'http://localhost:12321'))
      .toBe('https://example.com/api/ping')
  })

  it('resolves base url from app store config', () => {
    vi.stubEnv('DEV', false)
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        protocol: 'http:',
        port: '12321',
        hostname: 'localhost',
        origin: 'http://localhost:12321',
      },
    })
    expect(getApiBaseUrl(appStore)).toBe('http://localhost:12321')
  })

  it('uses vite proxy base in dev when ui runs on vite port', () => {
    vi.stubEnv('DEV', true)
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        protocol: 'http:',
        port: '3000',
        hostname: 'localhost',
        origin: 'http://localhost:3000',
      },
    })

    expect(getApiBaseUrl(appStore)).toBe('')
  })
})

describe('apiClient auth headers', () => {
  beforeEach(() => {
    mockGetAuthToken.mockReturnValue(null)
    vi.spyOn(axios, 'request').mockResolvedValue({
      data: {},
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as never,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('attaches Authorization on get/post when a token is present', async () => {
    mockGetAuthToken.mockReturnValue('test-token')
    await apiClient.get('/api/ping')
    expect(axios.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    )

    await apiClient.post('/api/ping', {ok: true})
    expect(axios.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
        data: {ok: true},
      }),
    )
  })
})


describe('unauthorized response ownership', () => {
  beforeEach(() => { vi.mocked(clearAuthToken).mockClear() })
  afterEach(() => { mockGetAuthToken.mockReturnValue(null) })
  const unauthorized = (authorization?: string) => axios.get('/test', {
    headers: authorization ? {Authorization: authorization} : {},
    adapter: async config => { throw Object.assign(new Error('unauthorized'), {config, response: {status: 401}}) },
  })
  it('keeps a newer login when an old authenticated request returns 401', async () => {
    mockGetAuthToken.mockReturnValue('new-session')
    await expect(unauthorized('Bearer old-session')).rejects.toThrow('unauthorized')
    expect(clearAuthToken).not.toHaveBeenCalled()
  })
  it('keeps a newer login when an older anonymous request returns 401', async () => {
    mockGetAuthToken.mockReturnValue('new-session')
    await expect(unauthorized()).rejects.toThrow('unauthorized')
    expect(clearAuthToken).not.toHaveBeenCalled()
  })
  it('still clears the current session when its own request returns 401', async () => {
    mockGetAuthToken.mockReturnValue('current-session')
    await expect(unauthorized('Bearer current-session')).rejects.toThrow('unauthorized')
    expect(clearAuthToken).toHaveBeenCalledOnce()
  })
})
