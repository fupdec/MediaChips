import axios from 'axios'
import path from 'path-browserify'
import { resolveDirectBackendUrl } from '@/utils/apiBaseUrl'
import { buildApiUrl } from '@/services/apiClient'
import { useAppStore } from '@/stores/app'
import { typedApi } from '@/services/typedApi'
import { destroySeparatePlayerWindow } from '@/utils/playerWindow'
import eventBus from '@/utils/eventBus'
import {clearThumbDisplayCache} from '@/utils/thumbDisplayCache'
import {clearFileExistenceBatchQueue} from '@/utils/fileExistenceBatcher'

interface AppConfigResponse {
  appVersion?: string
  path?: string
  databases?: unknown[]
  ip?: string
  port?: number | string
  allowLanAccess?: boolean
  allowLanAccessEnvLocked?: boolean
  [key: string]: unknown
}

export async function updateConfig(data: Record<string, unknown>) {
  return typedApi.updateConfig(data)
}

function applyConfigToStore(config: AppConfigResponse) {
  const store = useAppStore()
  store.localhost = resolveDirectBackendUrl(config)
  store.appVersion = config.appVersion || store.appVersion
  store.dbPath = config.path || ''
  store.mediaPath = path.join(config.path || '', 'media')
  store.databases = config.databases || []
  store.config = config
}

export async function refreshServerConfig() {
  const store = useAppStore()
  const response = await fetch(buildApiUrl('/api/config'))
  if (!response.ok) {
    throw new Error('Failed to refresh server config')
  }

  const config = await response.json() as AppConfigResponse
  applyConfigToStore(config)
  return config
}

export async function initConfig() {
  let config: AppConfigResponse | null = null

  try {
    const local = await axios.get<AppConfigResponse>('/config.json')
    config = local.data
  } catch (error) {
    console.error(error)
  }

  if (!config) {
    const remote = await axios.get<AppConfigResponse>(`${window.location.origin}/api/task/getConfig`)
    config = remote.data
  }

  applyConfigToStore(config)

  return config
}

export async function reloadApplicationAfterDatabaseChange() {
  clearThumbDisplayCache()
  clearFileExistenceBatchQueue()
  try {
    await destroySeparatePlayerWindow()
  } catch (error) {
    console.warn('Failed to destroy player window during database switch:', error)
  }
  await refreshServerConfig()
  eventBus.$emit('app:database-changed')
}
