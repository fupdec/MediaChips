import { createSettingsRepository } from '../../db/repositories/settings'
import {
  DEFAULT_GLOBAL_APP_CONFIG,
  GLOBAL_APP_CONFIG_KEYS,
  readGlobalConfigString,
  type GlobalAppConfigKey,
} from '../../../shared/appGlobalConfig'

const DEFAULTS = {
  transcodeUnsupportedFormats: DEFAULT_GLOBAL_APP_CONFIG.transcodeUnsupportedFormats,
  transcodeMaxHeight: DEFAULT_GLOBAL_APP_CONFIG.transcodeMaxHeight,
  transcodeCacheMaxGb: DEFAULT_GLOBAL_APP_CONFIG.transcodeCacheMaxGb,
} as const satisfies Record<Extract<GlobalAppConfigKey,
  'transcodeUnsupportedFormats' | 'transcodeMaxHeight' | 'transcodeCacheMaxGb'>, string>

type TranscodeSettingKey = keyof typeof DEFAULTS
type TranscodeSettings = Record<TranscodeSettingKey, string>

interface TranscodeDb {
  drizzle?: import('../../db/client').DrizzleClient
}

function getGlobalServerConfig(): Record<string, unknown> | null {
  const globalConfig = global as { serverConfig?: Record<string, unknown> }
  return globalConfig.serverConfig ?? null
}

function readTranscodeSettingsFromGlobalConfig(): Partial<TranscodeSettings> {
  const globalConfig = getGlobalServerConfig()
  if (!globalConfig) return {}

  const settings: Partial<TranscodeSettings> = {}
  for (const key of Object.keys(DEFAULTS) as TranscodeSettingKey[]) {
    if (typeof globalConfig[key] === 'string') {
      settings[key] = globalConfig[key] as string
    }
  }

  return settings
}

function hasTranscodeSettingsInGlobalConfig(): boolean {
  const globalConfig = getGlobalServerConfig()
  if (!globalConfig) return false

  return (Object.keys(DEFAULTS) as TranscodeSettingKey[]).some((key) =>
    typeof globalConfig[key] === 'string',
  )
}

async function getTranscodeSettings(db: TranscodeDb | null | undefined): Promise<TranscodeSettings> {
  const settings: TranscodeSettings = {...DEFAULTS}
  const globalSettings = readTranscodeSettingsFromGlobalConfig()

  for (const [key, value] of Object.entries(globalSettings) as Array<[TranscodeSettingKey, string]>) {
    settings[key] = value
  }

  if (hasTranscodeSettingsInGlobalConfig() || !db?.drizzle) {
    return settings
  }

  try {
    const rows = createSettingsRepository(db.drizzle)
      .findByOptions(Object.keys(DEFAULTS))

    for (const row of rows) {
      const key = row.option as TranscodeSettingKey
      if (key in settings) {
        settings[key] = String(row.value)
      }
    }
  } catch (error) {
    console.error('Failed to load transcode settings:', error)
  }

  return settings
}

function isTranscodeEnabled(settings: TranscodeSettings): boolean {
  return String(settings.transcodeUnsupportedFormats) === '1'
}

function getMaxHeight(settings: TranscodeSettings): number | null {
  const value = Number(settings.transcodeMaxHeight)
  if (!Number.isFinite(value) || value <= 0) return null
  return value
}

function parseMaxHeightOverride(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const num = Number(value)
  if (!Number.isFinite(num)) return undefined
  if (num <= 0) return null
  return num
}

export {
  DEFAULTS,
  getTranscodeSettings,
  isTranscodeEnabled,
  getMaxHeight,
  parseMaxHeightOverride,
}
