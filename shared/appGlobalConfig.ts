export const GLOBAL_APP_CONFIG_KEYS = [
  'allowLanAccess',
  'checkForUpdatesAtStartup',
  'selectedDisk',
  'transcodeUnsupportedFormats',
  'transcodeMaxHeight',
  'transcodeCacheMaxGb',
  'zoom',
] as const

export type GlobalAppConfigKey = typeof GLOBAL_APP_CONFIG_KEYS[number]

export const DEFAULT_GLOBAL_APP_CONFIG: Record<GlobalAppConfigKey, string> = {
  allowLanAccess: '1',
  checkForUpdatesAtStartup: '1',
  selectedDisk: '',
  transcodeUnsupportedFormats: '1',
  transcodeMaxHeight: '1080',
  transcodeCacheMaxGb: '5',
  zoom: '1',
}

export const MINIMIZE_TO_TRAY_CONFIG_KEY = 'minimizeToTray' as const

export function isGlobalAppConfigKey(key: string): key is GlobalAppConfigKey {
  return (GLOBAL_APP_CONFIG_KEYS as readonly string[]).includes(key)
}

export function readGlobalConfigString(
  source: Record<string, unknown> | null | undefined,
  key: GlobalAppConfigKey,
): string {
  if (!source) {
    return DEFAULT_GLOBAL_APP_CONFIG[key]
  }

  const value = source[key]
  if (typeof value === 'string') {
    return value
  }

  if (key === 'allowLanAccess' && typeof value === 'boolean') {
    return value ? '1' : '0'
  }

  return DEFAULT_GLOBAL_APP_CONFIG[key]
}
