import {ref, watch} from 'vue'
import {getApiBaseUrl} from './apiClient'
import {useAppStore} from '@/stores/app'

const enabledKey = 'mediachips:marker-moments:enabled'
export const markerMomentsEnabled = ref(localStorage.getItem(enabledKey) !== 'false')

watch(markerMomentsEnabled, (enabled) => localStorage.setItem(enabledKey, String(enabled)))

const autoRefreshKey = 'mediachips:marker-moments:auto-refresh'
export const markerMomentsAutoRefresh = ref(localStorage.getItem(autoRefreshKey) !== 'false')

watch(markerMomentsAutoRefresh, (enabled) => localStorage.setItem(autoRefreshKey, String(enabled)))

export function markerMomentRejectionKey(tagId: number) {
  return JSON.stringify(['mediachips:marker-moments:rejected', getApiBaseUrl(), useAppStore().dbPath, tagId])
}

export function readMarkerMomentRejections(key: string): string[] {
  try {
    const values: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(values)
      ? values.filter((value): value is string => typeof value === 'string' && /^\d+:\d+$/.test(value)).slice(-1000)
      : []
  } catch {
    return []
  }
}
