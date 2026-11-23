import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'

const {putSetting, persistGlobalAppConfig} = vi.hoisted(() => ({
  putSetting: vi.fn().mockResolvedValue(undefined),
  persistGlobalAppConfig: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/services/typedApi', () => ({
  typedApi: {
    putSetting,
    getSetting: vi.fn(),
  },
}))

vi.mock('@/services/globalAppConfig', () => ({
  isGlobalAppConfigKey: (key: string) => key === 'tpdbApiKey' || key === 'zoom',
  persistGlobalAppConfig,
}))

import {useSettingsStore} from '@/stores/settings'
import {resetSettingsServiceForTests, setOption} from '@/services/settingsService'

function deferredWrite() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail })
  return {promise, resolve, reject}
}

describe('settingsService.setOption', () => {
  afterEach(() => vi.useRealTimers())
  beforeEach(() => {
    setActivePinia(createPinia())
    resetSettingsServiceForTests()
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  it('updates the store immediately', async () => {
    const settings = useSettingsStore()
    const pending = setOption('1', 'sceneAutoApplyOnExactMatch')

    expect(settings.sceneAutoApplyOnExactMatch).toBe('1')
    expect(putSetting).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(10)
    await pending

    expect(putSetting).toHaveBeenCalledWith('sceneAutoApplyOnExactMatch', '1')
  })

  it('does not let a different option cancel another pending write', async () => {
    const first = setOption('1', 'sceneAutoApplyOnExactMatch')
    const second = setOption('0', 'sceneScraperImportMarkers')

    await vi.advanceTimersByTimeAsync(10)
    await Promise.all([first, second])

    expect(putSetting).toHaveBeenCalledWith('sceneAutoApplyOnExactMatch', '1')
    expect(putSetting).toHaveBeenCalledWith('sceneScraperImportMarkers', '0')
    expect(putSetting).toHaveBeenCalledTimes(2)
  })

  it('keeps only the latest value for the same option within the debounce window', async () => {
    const first = setOption('1', 'scraperPerformerGender')
    const second = setOption('Male', 'scraperPerformerGender')

    await vi.advanceTimersByTimeAsync(10)
    await Promise.all([first, second])

    expect(putSetting).toHaveBeenCalledTimes(1)
    expect(putSetting).toHaveBeenCalledWith('scraperPerformerGender', 'Male')
    expect(useSettingsStore().scraperPerformerGender).toBe('Male')
  })

  it('persists global keys through persistGlobalAppConfig', async () => {
    const pending = setOption('secret-key', 'tpdbApiKey')

    await vi.advanceTimersByTimeAsync(10)
    await pending

    expect(persistGlobalAppConfig).toHaveBeenCalledWith({tpdbApiKey: 'secret-key'})
    expect(putSetting).not.toHaveBeenCalled()
    expect(useSettingsStore().tpdbApiKey).toBe('secret-key')
  })

  it('serializes writes and coalesces edits made while the first write is active', async () => {
    const slow = deferredWrite()
    putSetting.mockReturnValueOnce(slow.promise)
    const first = setOption('old', 'scraperPerformerGender')
    await vi.advanceTimersByTimeAsync(10)
    const middle = setOption('middle', 'scraperPerformerGender')
    await vi.advanceTimersByTimeAsync(10)
    const latest = setOption('latest', 'scraperPerformerGender')
    await vi.advanceTimersByTimeAsync(10)
    expect(putSetting).toHaveBeenCalledTimes(1)
    expect(useSettingsStore().scraperPerformerGender).toBe('latest')
    slow.resolve()
    await vi.advanceTimersByTimeAsync(0)
    await Promise.all([first, middle, latest])
    expect(putSetting.mock.calls).toEqual([
      ['scraperPerformerGender', 'old'], ['scraperPerformerGender', 'latest'],
    ])
  })

  it('continues with a newer value after an earlier write fails', async () => {
    const slow = deferredWrite()
    putSetting.mockReturnValueOnce(slow.promise)
    const first = setOption('old', 'scraperPerformerGender')
    const failed = expect(first).rejects.toThrow('offline')
    await vi.advanceTimersByTimeAsync(10)
    const next = setOption('latest', 'scraperPerformerGender')
    await vi.advanceTimersByTimeAsync(10)
    slow.reject(new Error('offline'))
    await failed
    await vi.advanceTimersByTimeAsync(0)
    await next
    expect(putSetting).toHaveBeenLastCalledWith('scraperPerformerGender', 'latest')
    expect(putSetting).toHaveBeenCalledTimes(2)
  })

  it('allows unrelated settings to save while another key is blocked', async () => {
    const slow = deferredWrite()
    putSetting.mockReturnValueOnce(slow.promise)
    const first = setOption('old', 'scraperPerformerGender')
    await vi.advanceTimersByTimeAsync(10)
    const second = setOption('1', 'sceneAutoApplyOnExactMatch')
    await vi.advanceTimersByTimeAsync(10)
    await second
    expect(putSetting).toHaveBeenCalledTimes(2)
    slow.resolve()
    await first
  })

  it('keeps the debounce delay when an active request finishes during a new edit', async () => {
    const slow = deferredWrite()
    putSetting.mockReturnValueOnce(slow.promise)
    const first = setOption('old', 'scraperPerformerGender')
    await vi.advanceTimersByTimeAsync(10)
    const next = setOption('latest', 'scraperPerformerGender')
    slow.resolve()
    await first
    expect(putSetting).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10)
    await next
    expect(putSetting).toHaveBeenCalledTimes(2)
  })

  it('also serializes repeated writes of a global option', async () => {
    const slow = deferredWrite()
    persistGlobalAppConfig.mockReturnValueOnce(slow.promise)
    const first = setOption('1', 'zoom')
    await vi.advanceTimersByTimeAsync(10)
    const next = setOption('1.5', 'zoom')
    await vi.advanceTimersByTimeAsync(10)
    expect(persistGlobalAppConfig).toHaveBeenCalledTimes(1)
    slow.resolve()
    await vi.advanceTimersByTimeAsync(0)
    await Promise.all([first, next])
    expect(persistGlobalAppConfig.mock.calls).toEqual([[{zoom: '1'}], [{zoom: '1.5'}]])
  })

})
