import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import type {UpdaterState} from '@shared/electron/ipc'

vi.mock('@/stores/app', () => ({useAppStore: () => ({isElectron: true})}))
vi.mock('@/services/updatePreferences', () => ({isUpdateVersionSkipped: () => false, skipUpdateVersion: vi.fn()}))
const listeners = new Set<(status: UpdaterState) => void>()
const updater = {
  isSupported: vi.fn(), getState: vi.fn(),
  onStatus: vi.fn((listener: (status: UpdaterState) => void) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }),
}
beforeEach(() => {
  vi.resetModules()
  listeners.clear()
  vi.clearAllMocks()
  updater.isSupported.mockResolvedValue(true)
  updater.getState.mockReset().mockResolvedValue({state: 'idle'})
  vi.stubGlobal('electronAPI', {updater})
})
afterEach(() => vi.unstubAllGlobals())

describe('updater initialization', () => {
  it('removes its status listener if initialization fails before retrying', async () => {
    updater.getState.mockRejectedValueOnce(new Error('IPC unavailable'))
    const {useAppUpdater} = await import('./useAppUpdater')
    const appUpdater = useAppUpdater()
    await expect(appUpdater.ensureInitialized()).rejects.toThrow('IPC unavailable')
    expect(listeners.size).toBe(0)
    await appUpdater.ensureInitialized()
    expect(listeners.size).toBe(1)
  })
  it('keeps a newer status event when the initial snapshot arrives late', async () => {
    let finish!: (state: UpdaterState) => void
    updater.getState.mockReturnValue(new Promise<UpdaterState>(resolve => { finish = resolve }))
    const {useAppUpdater} = await import('./useAppUpdater')
    const appUpdater = useAppUpdater()
    const initializing = appUpdater.ensureInitialized()
    await vi.waitFor(() => expect(updater.getState).toHaveBeenCalledOnce())
    for (const listener of listeners) listener({state: 'downloaded', nextVersion: '3.0.0'})
    finish({state: 'idle'})
    await initializing
    expect(appUpdater.status.value.state).toBe('downloaded')
    expect(appUpdater.status.value.nextVersion).toBe('3.0.0')
  })

})
