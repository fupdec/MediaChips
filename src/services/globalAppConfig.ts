import {
  DEFAULT_GLOBAL_APP_CONFIG,
  GLOBAL_APP_CONFIG_KEYS,
  MINIMIZE_TO_TRAY_CONFIG_KEY,
  isGlobalAppConfigKey,
  readGlobalConfigString,
  readMinimizeToTrayConfig,
  type GlobalAppConfigKey,
} from '@shared/appGlobalConfig'
import { useAppStore } from '@/stores/app'
import useSettingsStore from '@/stores/settings'
import { updateConfig } from '@/services/configService'
import { typedApi } from '@/services/typedApi'
import { syncMinimizeToTray } from '@/services/electronBridge'

export type GlobalAppConfigState = Record<GlobalAppConfigKey, string>

export { GLOBAL_APP_CONFIG_KEYS, isGlobalAppConfigKey, type GlobalAppConfigKey }

export function hasGlobalAppConfigInConfig(
  config: Record<string, unknown> | null | undefined = useAppStore().config,
): boolean {
  if (!config) return false

  return GLOBAL_APP_CONFIG_KEYS.some((key) => {
    const value = config[key]
    return typeof value === 'string' || (key === 'allowLanAccess' && typeof value === 'boolean')
  })
}

export function readGlobalAppConfigFromStore(
  config: Record<string, unknown> | null | undefined = useAppStore().config,
): GlobalAppConfigState {
  const result = {} as GlobalAppConfigState

  for (const key of GLOBAL_APP_CONFIG_KEYS) {
    result[key] = readGlobalConfigString(config, key)
  }

  return result
}

export function applyGlobalAppConfigToSettings(state: GlobalAppConfigState): void {
  const settings = useSettingsStore()

  for (const key of GLOBAL_APP_CONFIG_KEYS) {
    settings[key] = state[key]
  }
}

function readDbValueForKey(key: GlobalAppConfigKey): string {
  const settings = useSettingsStore()
  const value = settings[key]
  return typeof value === 'string' ? value : DEFAULT_GLOBAL_APP_CONFIG[key]
}

function hasMeaningfulDbState(
  dbState: GlobalAppConfigState,
  hadInDb: Partial<Record<GlobalAppConfigKey, boolean>> = {},
): boolean {
  return GLOBAL_APP_CONFIG_KEYS.some((key) => {
    if (hadInDb[key]) return true
    return dbState[key] !== DEFAULT_GLOBAL_APP_CONFIG[key]
  })
}

async function clearGlobalKeysFromDb(state: GlobalAppConfigState): Promise<void> {
  for (const key of GLOBAL_APP_CONFIG_KEYS) {
    await typedApi.putSetting(key, '')
  }

  applyGlobalAppConfigToSettings(state)
}

export async function persistGlobalAppConfig(
  partial: Partial<GlobalAppConfigState>,
  options: { clearDb?: boolean } = {},
): Promise<void> {
  const next: GlobalAppConfigState = {
    ...readGlobalAppConfigFromStore(),
    ...partial,
  }

  await updateConfig(next)

  const appStore = useAppStore()
  appStore.config = {
    ...appStore.config,
    ...next,
  }

  applyGlobalAppConfigToSettings(next)

  if (options.clearDb !== false) {
    await clearGlobalKeysFromDb(next)
  }
}

function isKeyPresentInConfig(
  config: Record<string, unknown> | null | undefined,
  key: GlobalAppConfigKey,
): boolean {
  if (!config) return false
  const value = config[key]
  return typeof value === 'string' || (key === 'allowLanAccess' && typeof value === 'boolean')
}

export async function migrateGlobalAppConfigFromDbIfNeeded(
  options: { hadInDb?: Partial<Record<GlobalAppConfigKey, boolean>> } = {},
): Promise<void> {
  const dbState = {} as GlobalAppConfigState
  for (const key of GLOBAL_APP_CONFIG_KEYS) {
    dbState[key] = readDbValueForKey(key)
  }

  if (hasGlobalAppConfigInConfig()) {
    const appStore = useAppStore()
    const configState = readGlobalAppConfigFromStore()
    const merges: Partial<GlobalAppConfigState> = {}

    // Newly promoted global keys may still live only in the DB while older
    // keys are already in config.json — copy those DB values before clearing.
    for (const key of GLOBAL_APP_CONFIG_KEYS) {
      if (isKeyPresentInConfig(appStore.config, key)) continue
      if (dbState[key] === DEFAULT_GLOBAL_APP_CONFIG[key]) continue
      merges[key] = dbState[key]
    }

    if (Object.keys(merges).length > 0) {
      await persistGlobalAppConfig({...configState, ...merges})
      return
    }

    applyGlobalAppConfigToSettings(configState)

    const hadAnyInDb = options.hadInDb
      ? GLOBAL_APP_CONFIG_KEYS.some((key) => options.hadInDb?.[key])
      : false

    if (hadAnyInDb) {
      await clearGlobalKeysFromDb(configState)
    }

    return
  }

  if (hasMeaningfulDbState(dbState, options.hadInDb)) {
    await persistGlobalAppConfig(dbState)
    return
  }

  applyGlobalAppConfigToSettings(readGlobalAppConfigFromStore())
}

export async function migrateMinimizeToTrayFromDbIfNeeded(
  dbValue: string | undefined,
): Promise<void> {
  const appStore = useAppStore()
  if (typeof appStore.config[MINIMIZE_TO_TRAY_CONFIG_KEY] === 'string') {
    return
  }

  if (dbValue !== '0' && dbValue !== '1') {
    return
  }

  await persistMinimizeToTray(dbValue === '1')
  await typedApi.putSetting(MINIMIZE_TO_TRAY_CONFIG_KEY, '')
}

export async function persistMinimizeToTray(enabled: boolean): Promise<void> {
  const value = enabled ? '1' : '0'

  await updateConfig({ [MINIMIZE_TO_TRAY_CONFIG_KEY]: value })

  const appStore = useAppStore()
  appStore.config = {
    ...appStore.config,
    [MINIMIZE_TO_TRAY_CONFIG_KEY]: value,
  }

  void syncMinimizeToTray(enabled)
}

export function readMinimizeToTrayFromStore(
  config: Record<string, unknown> | null | undefined = useAppStore().config,
): boolean {
  return readMinimizeToTrayConfig(config) === '1'
}
