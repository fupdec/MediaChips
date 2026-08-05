/**
 * @vitest-environment node
 */
import {describe, expect, it, vi} from 'vitest'
import {
  buildLoadingPageUrl,
  buildRendererUrl,
  clampZoomFactor,
  createWaitForBackend,
} from './rendererBootstrap'

describe('buildRendererUrl', () => {
  it('builds localhost URLs with optional search', () => {
    expect(buildRendererUrl({port: 12321})).toBe('http://localhost:12321/')
    expect(buildRendererUrl({port: 3000, search: '?player=true'})).toBe(
      'http://localhost:3000/?player=true',
    )
    expect(buildRendererUrl({port: 3000, search: 'player=true'})).toBe(
      'http://localhost:3000/?player=true',
    )
  })
})

describe('buildLoadingPageUrl', () => {
  it('picks public vs dist loading page', () => {
    expect(buildLoadingPageUrl({appRoot: '/app', useViteDevServer: true})).toBe(
      'file:///app/public/loading.html',
    )
    expect(buildLoadingPageUrl({appRoot: '/app', useViteDevServer: false})).toBe(
      'file:///app/dist/loading.html',
    )
  })
})

describe('clampZoomFactor', () => {
  it('clamps to 0.5–3 and defaults invalid values to 1', () => {
    expect(clampZoomFactor(1.5)).toBe(1.5)
    expect(clampZoomFactor(0.1)).toBe(0.5)
    expect(clampZoomFactor(9)).toBe(3)
    expect(clampZoomFactor('nope')).toBe(1)
  })
})

describe('createWaitForBackend', () => {
  it('returns when /api/ping succeeds', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ok: true})
    const waitForBackend = createWaitForBackend({
      getPort: () => 12321,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async () => {},
    })
    await waitForBackend(12321, 1000)
    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:12321/api/ping')
  })

  it('warns and continues after timeout', async () => {
    const logWarn = vi.fn()
    const waitForBackend = createWaitForBackend({
      getPort: () => 9,
      fetchImpl: vi.fn().mockRejectedValue(new Error('down')) as unknown as typeof fetch,
      sleep: async () => {},
      logWarn,
    })
    const now = Date.now()
    const dateNow = vi.spyOn(Date, 'now')
      .mockReturnValueOnce(now)
      .mockReturnValueOnce(now + 1)
      .mockReturnValue(now + 50)
    await waitForBackend(9, 10)
    expect(logWarn).toHaveBeenCalled()
    dateNow.mockRestore()
  })
})
