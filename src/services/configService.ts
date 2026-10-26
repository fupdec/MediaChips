import path from 'path-browserify'
import { getLocalBackendUrl, resolveDirectBackendUrl } from '@/utils/apiBaseUrl'
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
  // path-browserify treats `\` as a literal; keep stored roots slash-normalized on Windows.
  const dbPath = String(config.path || '').replace(/\\/g, '/')
  store.dbPath = dbPath
  store.mediaPath = path.join(dbPath, 'media')
  store.databases = config.databases || []
  store.config = config
}

export async function refreshServerConfig() {
  const {data} = await typedApi.getServerConfig()
  applyConfigToStore(data)
  return data
}

export async function initConfig() {
  // Bootstrap from this server, never a config copied from the build machine.
  let baseURL = window.location.origin
  if (window.electronAPI) {
    const {port} = await window.electronAPI.invoke('get-config')
    if (typeof port === 'number' && Number.isInteger(port) && port > 0 && port <= 65535) {
      baseURL = getLocalBackendUrl(port)
    }
  }
  const {data: config} = await typedApi.getServerConfig({baseURL})
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
