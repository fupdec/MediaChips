import {afterEach, describe, expect, it, vi} from 'vitest'
import {forceClearAppShellCache} from './registerPwa'

describe('forceClearAppShellCache', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('unregisters service workers, deletes caches, and reloads with bust param', async () => {
    const unregister = vi.fn(async () => true)
    const deleteCache = vi.fn(async () => true)
    const replace = vi.fn()

    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistrations: vi.fn(async () => [{unregister}]),
      },
    })
    vi.stubGlobal('caches', {
      keys: vi.fn(async () => ['workbox-precache', 'runtime']),
      delete: deleteCache,
    })
    vi.stubGlobal('location', {
      href: 'http://192.168.1.10:8080/settings',
      replace,
    })

    await forceClearAppShellCache()

    expect(unregister).toHaveBeenCalledTimes(1)
    expect(deleteCache).toHaveBeenCalledWith('workbox-precache')
    expect(deleteCache).toHaveBeenCalledWith('runtime')
    expect(replace).toHaveBeenCalledTimes(1)
    const reloadUrl = String(replace.mock.calls[0]?.[0] ?? '')
    expect(reloadUrl).toContain('http://192.168.1.10:8080/settings')
    expect(reloadUrl).toMatch(/[?&]_nocache=\d+/)
  })
})
