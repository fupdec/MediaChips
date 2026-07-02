import { useAppStore } from '@/stores/app'
import { useDialogsStore } from '@/stores/dialogs'
import { useSettingsStore } from '@/stores/settings'
import { useNotificationsStore } from '@/stores/notifications'
import { setOption } from '@/services/settingsService'
import { i18n } from '@/i18n/loadLocale'

export const ONBOARDING_STEP_COUNT = 4
const ONBOARDING_NOTIFICATION_SOURCE = 'onboarding'

function clampStep(step: number): number {
  return Math.max(0, Math.min(ONBOARDING_STEP_COUNT - 1, step))
}

export function getOnboardingStep(): number {
  const settings = useSettingsStore()
  return clampStep(Number(settings.onboardingStep) || 0)
}

export function shouldShowOnboarding(isPlayerWindow: boolean): boolean {
  if (isPlayerWindow) return false

  const settings = useSettingsStore()
  const app = useAppStore()

  if (app.isLocked) return false

  return settings.onboardingCompleted !== '1'
}

export function shouldAutoOpenOnboarding(isPlayerWindow: boolean): boolean {
  if (!shouldShowOnboarding(isPlayerWindow)) return false

  const settings = useSettingsStore()
  return settings.onboardingPaused !== '1'
}

export function openOnboardingIfNeeded(isPlayerWindow: boolean): void {
  if (shouldAutoOpenOnboarding(isPlayerWindow)) {
    openOnboarding()
    return
  }

  if (shouldShowOnboarding(isPlayerWindow)) {
    syncOnboardingNotification()
  }
}

export function openOnboarding(): void {
  useDialogsStore().onboarding.show = true
}

export async function saveOnboardingStep(step: number): Promise<void> {
  const clamped = clampStep(step)
  useSettingsStore().onboardingStep = String(clamped)
  await setOption(String(clamped), 'onboardingStep')
}

export async function dismissOnboarding(step: number): Promise<void> {
  useDialogsStore().onboarding.show = false
  const settings = useSettingsStore()
  settings.onboardingStep = String(clampStep(step))
  settings.onboardingPaused = '1'
  await saveOnboardingStep(step)
  await setOption('1', 'onboardingPaused')
  syncOnboardingNotification()
}

export async function skipOnboarding(): Promise<void> {
  useDialogsStore().onboarding.show = false
  const settings = useSettingsStore()
  settings.onboardingCompleted = '1'
  settings.onboardingPaused = '0'
  await setOption('1', 'onboardingCompleted')
  await setOption('0', 'onboardingPaused')
  removeOnboardingNotification()
}

export async function completeOnboarding(): Promise<void> {
  useDialogsStore().onboarding.show = false
  const settings = useSettingsStore()
  settings.onboardingCompleted = '1'
  settings.onboardingPaused = '0'
  settings.onboardingStep = String(ONBOARDING_STEP_COUNT - 1)
  await setOption('1', 'onboardingCompleted')
  await setOption('0', 'onboardingPaused')
  await saveOnboardingStep(ONBOARDING_STEP_COUNT - 1)
  removeOnboardingNotification()
}

function removeOnboardingNotification(): void {
  const store = useNotificationsStore()
  store.notifications = store.notifications.filter(
    (item) => item.source !== ONBOARDING_NOTIFICATION_SOURCE,
  )
}

export function syncOnboardingNotification(): void {
  if (!shouldShowOnboarding(false)) {
    removeOnboardingNotification()
    return
  }

  const settings = useSettingsStore()
  if (settings.onboardingPaused !== '1') {
    removeOnboardingNotification()
    return
  }

  const t = i18n.global.t
  const step = getOnboardingStep()
  const store = useNotificationsStore()

  removeOnboardingNotification()

  store.setNotification({
    source: ONBOARDING_NOTIFICATION_SOURCE,
    type: 'info',
    title: t('onboarding.notification.title'),
    text: t('onboarding.notification.text', {
      current: step + 1,
      total: ONBOARDING_STEP_COUNT,
    }),
    timeout: 0,
    icon: 'flag',
    actions: [
      {
        id: 'resume-onboarding',
        text: t('onboarding.notification.resume'),
        icon: 'play',
        action: () => openOnboarding(),
        hide: true,
      },
      {
        id: 'skip-onboarding',
        text: t('onboarding.skip'),
        action: () => {
          void skipOnboarding()
        },
        close: true,
      },
    ],
  })
}
