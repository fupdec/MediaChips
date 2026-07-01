import {afterEach, describe, expect, it, vi} from 'vitest'
import {subscribeElectronIpc} from '@/utils/electronIpc'
import type {ElectronBridgeAPI} from '@shared/electron/ipc'

describe('subscribeElectronIpc', () => {
  const originalElectronApi = window.electronAPI

  afterEach(() => {
    if (originalElectronApi === undefined) delete window.electronAPI
    else window.electronAPI = originalElectronApi
  })

  it('returns noop when electron API is unavailable', () => {
    delete window.electronAPI

    expect(() => subscribeElectronIpc('maximize', vi.fn())).not.toThrow()
  })

  it('returns unsubscribe from electronAPI.on', () => {
    const callback = vi.fn()
    const unsubscribe = vi.fn()
    window.electronAPI = {
      on: vi.fn(() => unsubscribe),
    } as unknown as ElectronBridgeAPI

    const result = subscribeElectronIpc('maximize', callback)

    expect(window.electronAPI.on).toHaveBeenCalledWith('maximize', callback)
    expect(result).toBe(unsubscribe)
  })
})
