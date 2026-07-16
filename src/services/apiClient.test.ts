import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildApiUrl, getApiBaseUrl } from '@/services/apiClient'

describe('apiClient helpers', () => {
  const appStore = {
    localhost: 'http://127.0.0.1:12321',
    config: { ip: 'localhost', port: 12321 },
  }

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('builds api urls from relative paths', () => {
    expect(buildApiUrl('/api/media/items', 'http://localhost:12321'))
      .toBe('http://localhost:12321/api/media/items')
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
