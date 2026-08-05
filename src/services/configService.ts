import axios from 'axios'
import path from 'path-browserify'
import { resolveDirectBackendUrl } from '@/utils/apiBaseUrl'
import { useAppStore } from '@/stores/app'
import { typedApi } from '@/services/typedApi'
import type { ServerConfig } from '@/services/typedApi/system'
import { destroySeparatePlayerWindow } from '@/utils/playerWindow'
import eventBus from '@/utils/eventBus'
import {clearThumbDisplayCache} from '@/utils/thumbDisplayCache'
import {clearFileExistenceBatchQueue} from '@/utils/fileExistenceBatcher'

export async function updateConfig(data: Record<string, unknown>) {
  return typedApi.updateConfig(data)
}

function applyConfigToStore(config: ServerConfig) {
  const store = useAppStore()
  store.localhost = resolveDirectBackendUrl(config)
  store.appVersion = config.appVersion || store.appVersion
  store.dbPath = config.path || ''
  store.mediaPath = path.join(config.path || '', 'media')
  store.databases = config.databases || []
  store.config = config
}

export async function refreshServerConfig() {
  const {data} = await typedApi.getServerConfig()
  applyConfigToStore(data)
  return data
}

export async function initConfig() {
  let config: ServerConfig | null = null

  try {
    const local = await axios.get<ServerConfig>('/config.json')
    config = local.data
  } catch (error) {
    console.error(error)
  }

  if (!config) {
    const remote = await typedApi.getTaskConfig({baseURL: window.location.origin})
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
