import {useAppStore} from '@/stores/app'
import {updateConfig} from '@/services/configService'
import {useRegistrationStore} from '@/stores/registration'
import {decideFreeLibraryCapMigration} from '@/utils/freeLibraryCap'

export type FreeLibraryCapConfigState = {
  freeLibraryCapSettled: string
  freeLibraryGrandfathered: string
}

const DEFAULT_STATE: FreeLibraryCapConfigState = {
  freeLibraryCapSettled: '0',
  freeLibraryGrandfathered: '0',
}

const CONFIG_KEYS = [
  'freeLibraryCapSettled',
  'freeLibraryGrandfathered',
] as const satisfies ReadonlyArray<keyof FreeLibraryCapConfigState>

export function readFreeLibraryCapConfig(
  config: Record<string, unknown> | null | undefined = useAppStore().config,
): FreeLibraryCapConfigState {
  const source = config || {}
  return {
    freeLibraryCapSettled: typeof source.freeLibraryCapSettled === 'string'
      ? source.freeLibraryCapSettled
      : DEFAULT_STATE.freeLibraryCapSettled,
    freeLibraryGrandfathered: typeof source.freeLibraryGrandfathered === 'string'
      ? source.freeLibraryGrandfathered
      : DEFAULT_STATE.freeLibraryGrandfathered,
  }
}

export function isFreeLibraryCapSettled(
  config: Record<string, unknown> | null | undefined = useAppStore().config,
): boolean {
  return readFreeLibraryCapConfig(config).freeLibraryCapSettled === '1'
}

export function isFreeLibraryGrandfathered(
  config: Record<string, unknown> | null | undefined = useAppStore().config,
): boolean {
  return readFreeLibraryCapConfig(config).freeLibraryGrandfathered === '1'
}

export async function persistFreeLibraryCapConfig(
  partial: Partial<FreeLibraryCapConfigState>,
): Promise<FreeLibraryCapConfigState> {
  const next = {
    ...readFreeLibraryCapConfig(),
    ...partial,
  }

  await updateConfig(next)

  const appStore = useAppStore()
  appStore.config = {
    ...appStore.config,
    ...next,
  }

  return next
}

/**
 * Run once per install/config: if the active library already exceeds the free
 * cap when this version first boots, grandfather that install. Later backup
 * restores of a large DB do not re-run this (settled stays set).
 *
 * If media stats cannot be read, skip for now and retry on a later launch —
 * do not permanently settle as "not grandfathered".
 */
export async function settleFreeLibraryCapIfNeeded(): Promise<void> {
  if (isFreeLibraryCapSettled()) return

  const registrationStore = useRegistrationStore()
  let libraryCount = 0
  try {
    const {typedApi} = await import('@/services/typedApi')
    const response = await typedApi.getMediaStats()
    libraryCount = Number(response.data?.total) || 0
    registrationStore.libraryCount = libraryCount
  } catch (error) {
    console.warn('Deferring free library cap settle until media stats are available:', error)
    return
  }

  const decision = decideFreeLibraryCapMigration({
    settled: false,
    libraryCount,
  })
  if (!decision.run) return

  await persistFreeLibraryCapConfig({
    freeLibraryCapSettled: '1',
    freeLibraryGrandfathered: decision.grandfathered ? '1' : '0',
  })
}
