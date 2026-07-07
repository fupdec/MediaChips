import { createSettingsRepository } from '../../db/repositories/settings'
import {
  DEFAULT_GLOBAL_APP_CONFIG,
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

function readTranscodeSettingsFromGlobalConfig(
  globalConfig: Record<string, unknown>,
): TranscodeSettings {
  const settings = {} as TranscodeSettings

  for (const key of Object.keys(DEFAULTS) as TranscodeSettingKey[]) {
    settings[key] = readGlobalConfigString(globalConfig, key)
  }

  return settings
}

async function getTranscodeSettings(db: TranscodeDb | null | undefined): Promise<TranscodeSettings> {
  const globalConfig = getGlobalServerConfig()
  if (globalConfig) {
    return readTranscodeSettingsFromGlobalConfig(globalConfig)
  }

  const settings: TranscodeSettings = {...DEFAULTS}

  if (!db?.drizzle) {
    return settings
  }

  try {
    const rows = createSettingsRepository(db.drizzle)
      .findByOptions(Object.keys(DEFAULTS))

    for (const row of rows) {
      const key = row.option as TranscodeSettingKey
      const value = String(row.value ?? '')
      if (key in settings && value !== '') {
        settings[key] = value
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
