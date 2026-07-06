import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const { updateConfig, putSetting } = vi.hoisted(() => ({
  updateConfig: vi.fn().mockResolvedValue(undefined),
  putSetting: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/services/configService', () => ({
  updateConfig,
}))

vi.mock('@/services/typedApi', () => ({
  typedApi: {
    putSetting,
  },
}))

import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import {
  hasOnboardingInConfig,
  readOnboardingFromConfig,
  migrateOnboardingFromDbIfNeeded,
  persistOnboardingConfig,
} from '@/services/onboardingConfig'

describe('onboardingConfig', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('detects onboarding fields in global config', () => {
    expect(hasOnboardingInConfig({})).toBe(false)
    expect(hasOnboardingInConfig({ onboardingStep: '2' })).toBe(true)
  })

  it('reads onboarding defaults when config fields are missing', () => {
    expect(readOnboardingFromConfig({})).toEqual({
      onboardingCompleted: '0',
      onboardingStep: '0',
      onboardingPaused: '0',
    })
  })

  it('migrates onboarding progress from the active database to config', async () => {
    const settings = useSettingsStore()
    settings.onboardingCompleted = '0'
    settings.onboardingPaused = '1'
    settings.onboardingStep = '2'

    await migrateOnboardingFromDbIfNeeded()

    expect(updateConfig).toHaveBeenCalledWith({
      onboardingCompleted: '0',
      onboardingPaused: '1',
      onboardingStep: '2',
    })
    expect(useAppStore().config).toMatchObject({
      onboardingCompleted: '0',
      onboardingPaused: '1',
      onboardingStep: '2',
    })
  })

  it('prefers global config over per-database settings', async () => {
    const app = useAppStore()
    app.config = {
      onboardingCompleted: '1',
      onboardingStep: '3',
      onboardingPaused: '0',
    }

    const settings = useSettingsStore()
    settings.onboardingCompleted = '0'
    settings.onboardingPaused = '1'
    settings.onboardingStep = '1'

    await migrateOnboardingFromDbIfNeeded({ hadOnboardingInDb: true })

    expect(settings.onboardingCompleted).toBe('1')
    expect(settings.onboardingStep).toBe('3')
    expect(settings.onboardingPaused).toBe('0')
    expect(putSetting).toHaveBeenCalledTimes(3)
    expect(updateConfig).not.toHaveBeenCalled()
  })

  it('persists onboarding updates to config.json', async () => {
    await persistOnboardingConfig({ onboardingStep: '1' })

    expect(updateConfig).toHaveBeenCalledWith({
      onboardingCompleted: '0',
      onboardingStep: '1',
      onboardingPaused: '0',
    })
    expect(useSettingsStore().onboardingStep).toBe('1')
  })
})
