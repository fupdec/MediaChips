import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  isViteDevProxyMode,
  resolveApiBaseUrl,
  resolveDirectBackendUrl,
  resolveLanShareUrl,
  isLoopbackHost,
  getLocalBackendUrl,
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

  it('uses page origin in production when published host port differs from config.port', () => {
    vi.stubEnv('DEV', false)
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        protocol: 'http:',
        port: '12322',
        hostname: 'localhost',
        origin: 'http://localhost:12322',
      },
    })

    expect(resolveApiBaseUrl({ ip: '172.19.0.2', port: 12321 }))
      .toBe('http://localhost:12322')
  })

  it('resolves direct backend url to localhost in vite proxy mode', () => {
    expect(resolveDirectBackendUrl({ ip: '192.168.1.91', port: 12321 }, { url: 'http://192.168.1.91:12321/' }))
      .toBe('http://localhost:12321')
  })

  it('defaults ip to localhost outside browser http(s) page', () => {
    vi.stubEnv('DEV', false)
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        protocol: 'file:',
        port: '',
        hostname: '',
        origin: 'file://',
      },
    })

    expect(resolveApiBaseUrl({ port: 12321 }))
      .toBe('http://localhost:12321')
  })
})

describe('resolveLanShareUrl', () => {
  it('returns null when LAN access is disabled', () => {
    expect(resolveLanShareUrl({
      allowLanAccess: false,
      ip: '192.168.1.10',
      port: 12321,
    })).toBeNull()
  })

  it('prefers non-loopback serverInfo.webUrl', () => {
    expect(resolveLanShareUrl({
      allowLanAccess: true,
      ip: 'localhost',
      port: 12321,
      serverInfo: {webUrl: 'http://192.168.1.10:12321'},
    })).toBe('http://192.168.1.10:12321')
  })

  it('falls back to config.ip / ips and ignores localhost', () => {
    expect(resolveLanShareUrl({
      allowLanAccess: '1',
      ip: 'localhost',
      port: 12321,
      ips: ['127.0.0.1', '10.0.0.5'],
    })).toBe('http://10.0.0.5:12321')
  })

  it('ignores docker bridge IPs in share banner', () => {
    expect(resolveLanShareUrl({
      allowLanAccess: '1',
      ip: '172.19.0.2',
      port: 12321,
      serverInfo: {webUrl: 'http://172.19.0.2:12321'},
      ips: ['172.19.0.2'],
    })).toBeNull()
  })

  it('detects loopback hosts', () => {
    expect(isLoopbackHost('localhost')).toBe(true)
    expect(isLoopbackHost('127.0.0.1')).toBe(true)
    expect(isLoopbackHost('192.168.1.1')).toBe(false)
    expect(getLocalBackendUrl(12321)).toBe('http://127.0.0.1:12321')
  })
})
