import {useAppStore} from '@/stores/app'
import {updateConfig} from '@/services/configService'
import {useRegistrationStore} from '@/stores/registration'
import {isFreeLibraryCapSettled} from '@/services/freeLibraryCapConfig'
import {decideProAccessMigration} from '@/utils/proAccess'

export type ProAccessConfigState = {
  proAccessSettled: string
  proFeaturesGrandfathered: string
  proTrialStartedAt: string
}

const DEFAULT_STATE: ProAccessConfigState = {
  proAccessSettled: '0',
  proFeaturesGrandfathered: '0',
  proTrialStartedAt: '',
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
export async function settleProAccessIfNeeded(): Promise<void> {
  if (isProAccessSettled()) return

  const registrationStore = useRegistrationStore()
  let libraryCount = 0
  try {
    const {typedApi} = await import('@/services/typedApi')
    const response = await typedApi.getMediaStats()
    libraryCount = Number(response.data?.total) || 0
    registrationStore.libraryCount = libraryCount
  } catch (error) {
    console.warn('Deferring Pro access settle until media stats are available:', error)
    return
  }

  const decision = decideProAccessMigration({
    settled: false,
    capWasSettled: isFreeLibraryCapSettled(),
    libraryCount,
  })
  if (!decision.run) return

  await persistProAccessConfig({
    proAccessSettled: '1',
    proFeaturesGrandfathered: decision.grandfathered ? '1' : '0',
    proTrialStartedAt: decision.trialStartedAt,
  })
}
