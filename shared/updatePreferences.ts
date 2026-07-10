export const UPDATE_PREFERENCES_KEYS = [
  'lastSeenVersion',
  'skippedUpdateVersions',
] as const

export type UpdatePreferencesKey = typeof UPDATE_PREFERENCES_KEYS[number]

export type UpdatePreferencesState = {
  lastSeenVersion: string
  skippedUpdateVersions: string
}

export const DEFAULT_UPDATE_PREFERENCES: UpdatePreferencesState = {
  lastSeenVersion: '',
  skippedUpdateVersions: '',
}

export function parseSkippedUpdateVersions(raw: string | null | undefined): string[] {
  if (!raw) {
    return []
  }

  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function serializeSkippedUpdateVersions(versions: string[]): string {
  return [...new Set(versions.map((item) => item.trim()).filter(Boolean))].join(',')
}

export function readUpdatePreferences(
  source: Record<string, unknown> | null | undefined,
): UpdatePreferencesState {
  const config = source || {}

  return {
    lastSeenVersion: typeof config.lastSeenVersion === 'string'
      ? config.lastSeenVersion
      : DEFAULT_UPDATE_PREFERENCES.lastSeenVersion,
    skippedUpdateVersions: typeof config.skippedUpdateVersions === 'string'
      ? config.skippedUpdateVersions
      : DEFAULT_UPDATE_PREFERENCES.skippedUpdateVersions,
  }
}
