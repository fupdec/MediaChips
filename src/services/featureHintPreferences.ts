import {updateConfig} from '@/services/configService'
import {useAppStore} from '@/stores/app'

export const FEATURE_HINT_PREFERENCES_KEYS = ['seenFeatureHints'] as const

export type FeatureHintPreferencesState = {
  seenFeatureHints: string
}

export const DEFAULT_FEATURE_HINT_PREFERENCES: FeatureHintPreferencesState = {
  seenFeatureHints: '',
}

export function parseSeenFeatureHints(raw: string | null | undefined): string[] {
  if (!raw) return []
  return [...new Set(raw.split(',').map((item) => item.trim()).filter(Boolean))]
}

export function serializeSeenFeatureHints(ids: string[]): string {
  return [...new Set(ids.map((item) => item.trim()).filter(Boolean))].join(',')
}

export function readFeatureHintPreferences(
  source: Record<string, unknown> | null | undefined = useAppStore().config,
): FeatureHintPreferencesState {
  const config = source || {}
  return {
    seenFeatureHints: typeof config.seenFeatureHints === 'string'
      ? config.seenFeatureHints
      : DEFAULT_FEATURE_HINT_PREFERENCES.seenFeatureHints,
  }
}

export function getSeenFeatureHints(
  source: Record<string, unknown> | null | undefined = useAppStore().config,
): string[] {
  return parseSeenFeatureHints(readFeatureHintPreferences(source).seenFeatureHints)
}

export function isFeatureHintSeen(
  id: string,
  source: Record<string, unknown> | null | undefined = useAppStore().config,
): boolean {
  return getSeenFeatureHints(source).includes(id)
}

export async function markFeatureHintSeen(id: string): Promise<void> {
  const hintId = String(id || '').trim()
  if (!hintId) return

  const current = getSeenFeatureHints()
  if (current.includes(hintId)) return

  const seenFeatureHints = serializeSeenFeatureHints([...current, hintId])
  await updateConfig({seenFeatureHints})

  const appStore = useAppStore()
  appStore.config = {
    ...appStore.config,
    seenFeatureHints,
  }
}
