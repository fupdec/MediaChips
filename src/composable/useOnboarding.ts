import { useAppStore } from '@/stores/app'
import { useDialogsStore } from '@/stores/dialogs'
import { useSettingsStore } from '@/stores/settings'
import { useNotificationsStore } from '@/stores/notifications'
import { persistOnboardingConfig } from '@/services/onboardingConfig'
import { openWhatsNewIfNeeded } from '@/composable/useWhatsNew'
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
  await persistOnboardingConfig({ onboardingStep: String(clamped) }, { clearDb: false })
}

export async function dismissOnboarding(step: number): Promise<void> {
  useDialogsStore().onboarding.show = false
  await persistOnboardingConfig({
    onboardingStep: String(clampStep(step)),
    onboardingPaused: '1',
  })
  syncOnboardingNotification()
}

export async function skipOnboarding(): Promise<void> {
  useDialogsStore().onboarding.show = false
  await persistOnboardingConfig({
    onboardingCompleted: '1',
    onboardingPaused: '0',
  })
  removeOnboardingNotification()
  void openWhatsNewIfNeeded(false)
}

export async function completeOnboarding(): Promise<void> {
  useDialogsStore().onboarding.show = false
  await persistOnboardingConfig({
    onboardingCompleted: '1',
    onboardingPaused: '0',
    onboardingStep: String(ONBOARDING_STEP_COUNT - 1),
  })
  removeOnboardingNotification()
  void openWhatsNewIfNeeded(false)
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
