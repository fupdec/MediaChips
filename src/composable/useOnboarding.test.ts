import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const { setOption } = vi.hoisted(() => ({
  setOption: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/services/settingsService', () => ({
  setOption,
}))

import { useAppStore } from '@/stores/app'
import { useDialogsStore } from '@/stores/dialogs'
import { useNotificationsStore } from '@/stores/notifications'
import { useSettingsStore } from '@/stores/settings'
import {
  shouldShowOnboarding,
  shouldAutoOpenOnboarding,
  openOnboardingIfNeeded,
  completeOnboarding,
  skipOnboarding,
  dismissOnboarding,
  syncOnboardingNotification,
} from '@/composable/useOnboarding'

describe('useOnboarding', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('shows onboarding when not completed and app is unlocked', () => {
    const settings = useSettingsStore()
    settings.onboardingCompleted = '0'

    expect(shouldShowOnboarding(false)).toBe(true)
  })

  it('hides onboarding for player windows and completed setups', () => {
    const settings = useSettingsStore()
    settings.onboardingCompleted = '1'

    expect(shouldShowOnboarding(true)).toBe(false)
    expect(shouldShowOnboarding(false)).toBe(false)
  })

  it('hides onboarding while the app is locked', () => {
    const settings = useSettingsStore()
    const app = useAppStore()
    settings.onboardingCompleted = '0'
    app.isLocked = true

    expect(shouldShowOnboarding(false)).toBe(false)
  })

  it('auto-opens onboarding only when it is not paused', () => {
    const settings = useSettingsStore()
    settings.onboardingCompleted = '0'
    settings.onboardingPaused = '0'

    expect(shouldAutoOpenOnboarding(false)).toBe(true)

    settings.onboardingPaused = '1'
    expect(shouldAutoOpenOnboarding(false)).toBe(false)
  })

  it('opens the onboarding dialog when needed', () => {
    const settings = useSettingsStore()
    const dialogs = useDialogsStore()
    settings.onboardingCompleted = '0'
    settings.onboardingPaused = '0'

    openOnboardingIfNeeded(false)

    expect(dialogs.onboarding.show).toBe(true)
  })

  it('shows a resume notification when onboarding is paused', () => {
    const settings = useSettingsStore()
    const dialogs = useDialogsStore()
    const notifications = useNotificationsStore()
    settings.onboardingCompleted = '0'
    settings.onboardingPaused = '1'
    settings.onboardingStep = '2'

    openOnboardingIfNeeded(false)

    expect(dialogs.onboarding.show).toBe(false)
    expect(notifications.notifications.some((item) => item.source === 'onboarding')).toBe(true)
  })

  it('persists completion when skipped or finished', async () => {
    const settings = useSettingsStore()
    const dialogs = useDialogsStore()
    settings.onboardingCompleted = '0'
    dialogs.onboarding.show = true

    await skipOnboarding()

    expect(dialogs.onboarding.show).toBe(false)
    expect(setOption).toHaveBeenCalledWith('1', 'onboardingCompleted')

    dialogs.onboarding.show = true
    await completeOnboarding()

    expect(dialogs.onboarding.show).toBe(false)
    expect(setOption).toHaveBeenCalledWith('1', 'onboardingCompleted')
  })

  it('pauses onboarding and creates a resume notification when dismissed', async () => {
    const settings = useSettingsStore()
    const dialogs = useDialogsStore()
    const notifications = useNotificationsStore()
    settings.onboardingCompleted = '0'
    dialogs.onboarding.show = true

    await dismissOnboarding(2)

    expect(dialogs.onboarding.show).toBe(false)
    expect(setOption).toHaveBeenCalledWith('2', 'onboardingStep')
    expect(setOption).toHaveBeenCalledWith('1', 'onboardingPaused')
    expect(notifications.notifications.some((item) => item.source === 'onboarding')).toBe(true)
  })

  it('removes the resume notification after completion', async () => {
    const settings = useSettingsStore()
    settings.onboardingCompleted = '0'
    settings.onboardingPaused = '1'
    settings.onboardingStep = '1'

    syncOnboardingNotification()
    expect(useNotificationsStore().notifications.some((item) => item.source === 'onboarding')).toBe(true)

    await completeOnboarding()

    expect(useNotificationsStore().notifications.some((item) => item.source === 'onboarding')).toBe(false)
  })
})
