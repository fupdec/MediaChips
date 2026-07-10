import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  isViteDevProxyMode,
  resolveApiBaseUrl,
  resolveDirectBackendUrl,
} from '@/utils/apiBaseUrl'

describe('resolveApiBaseUrl', () => {
  const originalLocation = window.location

  beforeEach(() => {
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
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
  })

  it('uses vite proxy relative api base in dev when ui runs on vite port', () => {
    expect(resolveApiBaseUrl({ ip: '192.168.1.91', port: 12321 }, { url: 'http://192.168.1.91:12321/' }))
      .toBe('')
    expect(isViteDevProxyMode()).toBe(true)
  })

  it('prefers explicit server info url outside vite proxy mode', () => {
    vi.stubEnv('DEV', false)

    expect(resolveApiBaseUrl({ ip: 'localhost', port: 12321 }, { url: 'http://192.168.1.10:12321/' }))
      .toBe('http://192.168.1.10:12321')
  })

  it('uses current origin when ui is served from app server port', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        protocol: 'http:',
        port: '12321',
        hostname: '127.0.0.1',
        origin: 'http://127.0.0.1:12321',
      },
    })

    expect(resolveApiBaseUrl({ ip: '192.168.1.10', port: 12321 }))
      .toBe('http://127.0.0.1:12321')
  })

  it('resolves direct backend url to localhost in vite proxy mode', () => {
    expect(resolveDirectBackendUrl({ ip: '192.168.1.91', port: 12321 }, { url: 'http://192.168.1.91:12321/' }))
      .toBe('http://localhost:12321')
  })

  it('defaults ip to localhost outside vite proxy mode', () => {
    vi.stubEnv('DEV', false)

    expect(resolveApiBaseUrl({ port: 12321 }))
      .toBe('http://localhost:12321')
  })
})
