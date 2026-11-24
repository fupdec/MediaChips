import {useAppStore} from '@/stores/app'
import {typedApi} from '@/services/typedApi'
import {updateConfig} from '@/services/configService'
import {useRegistrationStore} from '@/stores/registration'
import {isFreeLibraryCapSettled} from '@/services/freeLibraryCapConfig'
import {decideProAccessMigration, proTrialDaysLeft, trialClockNow} from '@/utils/proAccess'

export type ProAccessConfigState = {
  proAccessSettled: string
  proFeaturesGrandfathered: string
  proTrialStartedAt: string
  proTrialLastSeenAt: string
  proTrialEndNoticeShown: string
}

const DEFAULT_STATE: ProAccessConfigState = {
  proAccessSettled: '0',
  proFeaturesGrandfathered: '0',
  proTrialStartedAt: '',
  proTrialLastSeenAt: '',
  proTrialEndNoticeShown: '0',
}

export function readProAccessConfig(
  config: Record<string, unknown> | null | undefined = useAppStore().config,
): ProAccessConfigState {
  const source = config || {}
  const read = (key: keyof ProAccessConfigState) =>
    typeof source[key] === 'string' ? source[key] as string : DEFAULT_STATE[key]
  return {
    proAccessSettled: read('proAccessSettled'),
    proFeaturesGrandfathered: read('proFeaturesGrandfathered'),
    proTrialStartedAt: read('proTrialStartedAt'),
    proTrialLastSeenAt: read('proTrialLastSeenAt'),
    proTrialEndNoticeShown: read('proTrialEndNoticeShown'),
  }
}

export function isProAccessSettled(
  config: Record<string, unknown> | null | undefined = useAppStore().config,
): boolean {
  return readProAccessConfig(config).proAccessSettled === '1'
}

export function isProFeaturesGrandfathered(
  config: Record<string, unknown> | null | undefined = useAppStore().config,
): boolean {
  return readProAccessConfig(config).proFeaturesGrandfathered === '1'
}

export async function persistProAccessConfig(
  partial: Partial<ProAccessConfigState>,
): Promise<ProAccessConfigState> {
  const next = {...readProAccessConfig(), ...partial}

  await updateConfig(next)

  const appStore = useAppStore()
  appStore.config = {...appStore.config, ...next}

  return next
}

/**
 * Run once per install: existing installs keep every Pro feature, a fresh empty install starts the
 * 30-day trial. Must run before the free-library cap migration, which marks fresh installs as
 * settled too and would make them look like existing ones.
 *
 * If media stats cannot be read, skip for now and retry on a later launch.
 */
export async function settleProAccessIfNeeded(): Promise<boolean> {
  if (isProAccessSettled()) return true

  const registrationStore = useRegistrationStore()
  let libraryCount = 0
  try {
    const response = await typedApi.getMediaStats()
    libraryCount = Number(response.data?.total) || 0
    registrationStore.libraryCount = libraryCount
  } catch (error) {
    console.warn('Deferring Pro access settle until media stats are available:', error)
    return false
  }

  const decision = decideProAccessMigration({
    settled: false,
    capWasSettled: isFreeLibraryCapSettled(),
    libraryCount,
  })
  if (!decision.run) return true

  await persistProAccessConfig({
    proAccessSettled: '1',
    proFeaturesGrandfathered: decision.grandfathered ? '1' : '0',
    proTrialStartedAt: decision.trialStartedAt,
  })
  return true
}

/** Waits before each retry of the settle when media stats are not readable yet (server still starting). */
export const PRO_SETTLE_RETRY_DELAYS_MS = [5_000, 30_000, 120_000]

/**
 * Until the install is settled every Pro feature is open, so a settle that silently never happens would
 * leave them open for good. Retry a few times with backoff; the next launch tries again after that.
 *
 * @returns true once the install is settled.
 */
export async function settleProAccessWithRetry(
  delays: readonly number[] = PRO_SETTLE_RETRY_DELAYS_MS,
  wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
): Promise<boolean> {
  if (await settleProAccessIfNeeded()) return true
  for (const delay of delays) {
    await wait(delay)
    if (await settleProAccessIfNeeded()) return true
  }
  return false
}

/**
 * Tell the user once, after the trial has run out, that Pro features are now locked. Without this the
 * trial chip just disappears and the first sign is a paywall in the middle of some task.
 *
 * Skipped until the machine id is known: without it a registered user would look unregistered.
 */
export async function announceProTrialEndIfNeeded(): Promise<void> {
  const config = readProAccessConfig()
  if (config.proAccessSettled !== '1' || config.proTrialEndNoticeShown === '1') return
  if (config.proFeaturesGrandfathered === '1' || !config.proTrialStartedAt) return

  const registrationStore = useRegistrationStore()
  if (!registrationStore.machineId || registrationStore.reg) return
  if (proTrialDaysLeft(config.proTrialStartedAt, trialClockNow(config.proTrialLastSeenAt)) !== 0) return

  const [{i18n}, {setNotification}, {useDialogsStore}] = await Promise.all([
    import('@/i18n/loadLocale'),
    import('@/services/notificationService'),
    import('@/stores/dialogs'),
  ])
  await persistProAccessConfig({proTrialEndNoticeShown: '1'})
  setNotification({
    type: 'info',
    title: i18n.global.t('registration.paywall_trial_ended'),
    text: i18n.global.t('registration.trial_ended_notice'),
    timeout: 0,
    click: () => useDialogsStore().openPaywall(),
  })
}
