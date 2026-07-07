import { debounce } from '@/utils/debounce'
import { useSettingsStore } from '@/stores/settings'
import { typedApi } from '@/services/typedApi'
import { isGlobalAppConfigKey, persistGlobalAppConfig } from '@/services/globalAppConfig'
import type { SettingsState } from '@/types/settings'

export async function getOption(option: keyof SettingsState | string) {
  return typedApi.getSetting(String(option))
}

export const setOption = debounce(async function setOption(
  value: SettingsState[keyof SettingsState],
  option: keyof SettingsState,
) {
  const settings = useSettingsStore()
  settings[option] = value

  if (isGlobalAppConfigKey(String(option))) {
    return persistGlobalAppConfig({ [option]: String(value) })
  }

  return await typedApi.putSetting(String(option), String(value))
}, 10)
