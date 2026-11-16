// @vitest-environment node
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import http from 'http'
import {isPublicAddress, publicLookup, resolvePublicHost, startExtractionProxy} from './network'

const lookupAll = vi.hoisted(() => vi.fn<(hostname: string, options: {all: true; verbatim: true}) => Promise<import('dns').LookupAddress[]>>())
vi.mock('dns/promises', () => ({lookup: lookupAll}))

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.restoreAllMocks())

describe('public web video networking', () => {
  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '2001:4860:4860::8888'])('accepts public IP %s', address => {
    expect(isPublicAddress(address)).toBe(true)
  })
  it.each(['0.0.0.0', '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.169.254', '172.16.0.1',
    '192.168.1.1', '192.0.2.1', '198.18.0.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '255.255.255.255',
    '::1', '::', '::ffff:127.0.0.1', 'fe80::1', 'fc00::1', '2001:db8::1', '2002:7f00:1::', '64:ff9b::7f00:1', 'bad'])('rejects reserved IP %s', address => {
    expect(isPublicAddress(address)).toBe(false)
  })

  it('rejects DNS answers containing any private address', async () => {
    lookupAll.mockResolvedValue([{address: '8.8.8.8', family: 4}, {address: '127.0.0.1', family: 4}])
    await expect(resolvePublicHost('cdn.example.com')).rejects.toThrow('Private or reserved')
    await expect(resolvePublicHost('localhost')).rejects.toThrow('public web hosts')
    await expect(resolvePublicHost('127.0.0.1')).rejects.toThrow('public web hosts')
  })

  it('pins the validated address and rechecks DNS on the next connection', async () => {
    lookupAll.mockResolvedValueOnce([{address: '8.8.8.8', family: 4}])
      .mockResolvedValueOnce([{address: '192.168.1.1', family: 4}])
    const first = vi.fn()
    publicLookup('cdn.example.com', {all: true}, first)
    await vi.waitFor(() => expect(first).toHaveBeenCalledWith(null, [{address: '8.8.8.8', family: 4}]))
    const second = vi.fn()
    publicLookup('cdn.example.com', {}, second)
    await vi.waitFor(() => expect(second).toHaveBeenCalledWith(expect.any(Error), '', 4))
  })

  it('blocks private CONNECT targets and HTTP redirects inside extractor traffic', async () => {
    lookupAll.mockResolvedValue([{address: '127.0.0.1', family: 4}])
    const proxy = await startExtractionProxy()
    const request = (method: string, target: string) => new Promise<number>(resolve => {
      const req = http.request(proxy.url, {method, path: target})
      req.on('connect', (res, socket) => { socket.destroy(); resolve(res.statusCode!) })
      req.on('response', res => { res.resume(); resolve(res.statusCode!) })
      req.end()
    })
    try {
      expect(await request('CONNECT', '127.0.0.1:443')).toBe(403)
      expect(await request('CONNECT', 'cdn.example.com:443')).toBe(403)
      expect(await request('CONNECT', 'cdn.example.com:8443')).toBe(403)
      expect(await request('GET', 'http://cdn.example.com/redirect-target')).toBe(502)
    } finally { proxy.close() }
  })
})
