import {beforeEach, describe, expect, it, vi} from 'vitest'
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

describe('settingsService.setOption', () => {
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
})
