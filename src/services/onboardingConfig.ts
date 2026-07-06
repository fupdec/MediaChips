import { useAppStore } from '@/stores/app'
import useSettingsStore from '@/stores/settings'
import { typedApi } from '@/services/typedApi'
import { updateConfig } from '@/services/configService'

export type OnboardingConfigState = {
  onboardingCompleted: string
  onboardingStep: string
  onboardingPaused: string
}

const DEFAULT_ONBOARDING: OnboardingConfigState = {
  onboardingCompleted: '0',
  onboardingStep: '0',
  onboardingPaused: '0',
}

const ONBOARDING_CONFIG_KEYS = [
  'onboardingCompleted',
  'onboardingStep',
  'onboardingPaused',
] as const satisfies ReadonlyArray<keyof OnboardingConfigState>

export function hasOnboardingInConfig(config: Record<string, unknown> | null | undefined = useAppStore().config): boolean {
  if (!config) return false

  return ONBOARDING_CONFIG_KEYS.some((key) => typeof config[key] === 'string')
}

export function readOnboardingFromConfig(
  config: Record<string, unknown> | null | undefined = useAppStore().config,
): OnboardingConfigState {
  const source = config || {}

  return {
    onboardingCompleted: typeof source.onboardingCompleted === 'string'
      ? source.onboardingCompleted
      : DEFAULT_ONBOARDING.onboardingCompleted,
    onboardingStep: typeof source.onboardingStep === 'string'
      ? source.onboardingStep
      : DEFAULT_ONBOARDING.onboardingStep,
    onboardingPaused: typeof source.onboardingPaused === 'string'
      ? source.onboardingPaused
      : DEFAULT_ONBOARDING.onboardingPaused,
  }
}

export function applyOnboardingConfigToSettings(state: OnboardingConfigState): void {
  const settings = useSettingsStore()
  settings.onboardingCompleted = state.onboardingCompleted
  settings.onboardingStep = state.onboardingStep
  settings.onboardingPaused = state.onboardingPaused
}

function hasOnboardingProgress(state: OnboardingConfigState): boolean {
  return state.onboardingCompleted === '1'
    || state.onboardingPaused === '1'
    || state.onboardingStep !== '0'
}

async function clearOnboardingFromDbIfNeeded(state: OnboardingConfigState): Promise<void> {
  for (const key of ONBOARDING_CONFIG_KEYS) {
    await typedApi.putSetting(key, '')
  }

  applyOnboardingConfigToSettings(state)
}

export async function persistOnboardingConfig(
  partial: Partial<OnboardingConfigState>,
  options: { clearDb?: boolean } = {},
): Promise<void> {
  const next = {
    ...readOnboardingFromConfig(),
    ...partial,
  }

  await updateConfig(next)

  const appStore = useAppStore()
  appStore.config = {
    ...appStore.config,
    ...next,
  }

  applyOnboardingConfigToSettings(next)

  if (options.clearDb !== false) {
    await clearOnboardingFromDbIfNeeded(next)
  }
}

export async function migrateOnboardingFromDbIfNeeded(options: { hadOnboardingInDb?: boolean } = {}): Promise<void> {
  const settings = useSettingsStore()
  const dbState: OnboardingConfigState = {
    onboardingCompleted: settings.onboardingCompleted,
    onboardingStep: settings.onboardingStep,
    onboardingPaused: settings.onboardingPaused,
  }

  if (hasOnboardingInConfig()) {
    const configState = readOnboardingFromConfig()
    applyOnboardingConfigToSettings(configState)
    if (options.hadOnboardingInDb) {
      await clearOnboardingFromDbIfNeeded(configState)
    }
    return
  }

  if (hasOnboardingProgress(dbState)) {
    await persistOnboardingConfig(dbState)
    return
  }

  applyOnboardingConfigToSettings(readOnboardingFromConfig())
}
