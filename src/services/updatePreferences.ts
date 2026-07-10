import {
  DEFAULT_UPDATE_PREFERENCES,
  parseSkippedUpdateVersions,
  readUpdatePreferences,
  serializeSkippedUpdateVersions,
  type UpdatePreferencesState,
} from '@shared/updatePreferences'
import { normalizeVersion } from '@/utils/changelogParser'
import { useAppStore } from '@/stores/app'
import { updateConfig } from '@/services/configService'

export function readUpdatePreferencesFromStore(
  config: Record<string, unknown> | null | undefined = useAppStore().config,
): UpdatePreferencesState {
  return readUpdatePreferences(config)
}

export function getSkippedUpdateVersions(
  config: Record<string, unknown> | null | undefined = useAppStore().config,
): string[] {
  return parseSkippedUpdateVersions(readUpdatePreferences(config).skippedUpdateVersions)
}

export function isUpdateVersionSkipped(
  version: string,
  config: Record<string, unknown> | null | undefined = useAppStore().config,
): boolean {
  const normalized = normalizeVersion(version)
  return getSkippedUpdateVersions(config).some((item) => normalizeVersion(item) === normalized)
}

export async function persistUpdatePreferences(
  partial: Partial<UpdatePreferencesState>,
): Promise<void> {
  const next: UpdatePreferencesState = {
    ...readUpdatePreferencesFromStore(),
    ...partial,
  }

  await updateConfig(next)

  const appStore = useAppStore()
  appStore.config = {
    ...appStore.config,
    ...next,
  }
}

export async function persistLastSeenVersion(version: string): Promise<void> {
  await persistUpdatePreferences({
    lastSeenVersion: normalizeVersion(version),
  })
}

export async function skipUpdateVersion(version: string): Promise<void> {
  const normalized = normalizeVersion(version)
  const current = getSkippedUpdateVersions()

  if (current.some((item) => normalizeVersion(item) === normalized)) {
    return
  }

  await persistUpdatePreferences({
    skippedUpdateVersions: serializeSkippedUpdateVersions([...current, normalized]),
  })
}

export function getLastSeenVersion(
  config: Record<string, unknown> | null | undefined = useAppStore().config,
): string {
  return readUpdatePreferences(config).lastSeenVersion || DEFAULT_UPDATE_PREFERENCES.lastSeenVersion
}
