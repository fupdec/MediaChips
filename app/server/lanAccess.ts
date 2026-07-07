import type { ApiDb } from '../../api/types/db'
import type { ServerConfig, NetworkIpInfo } from '../types/server'
import os from 'os'
import { createSettingsRepository } from '../../api/db/repositories/settings'
import { saveConfigFile } from './configFile'

const LAN_ENABLED_VALUES = ['1', 'true', 'yes', 'on']

interface NetworkHelpers {
  getBestLocalIp: () => string
  getAllIps: () => NetworkIpInfo[]
}

interface ServerNetworkDeps {
  config: ServerConfig
  configPath: string
  getBestLocalIp: () => string
  getAllIps: () => NetworkIpInfo[]
  restartListener: () => Promise<void>
}

let lanEnabled = true
let envLocked = false
let serverDeps: ServerNetworkDeps | null = null

function parseBooleanSetting(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback
  if (value === true || value === 1) return true
  if (value === false || value === 0) return false
  const normalized = String(value).toLowerCase()
  if (LAN_ENABLED_VALUES.includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function readEnvLanAccess(): boolean | null {
  const envVal = process.env.MEDIA_CHIPS_ALLOW_LAN
  if (envVal === undefined || envVal === '') return null
  return LAN_ENABLED_VALUES.includes(String(envVal).toLowerCase())
}

function isLanAccessEnabled(): boolean {
  return lanEnabled
}

function isLanAccessEnvLocked(): boolean {
  return envLocked
}

function getBindHost(): string {
  return lanEnabled ? '0.0.0.0' : '127.0.0.1'
}

function syncNetworkConfig(
  config: ServerConfig,
  enabled: boolean,
  helpers: NetworkHelpers,
) {
  const bestIp = helpers.getBestLocalIp()
  const allIps = helpers.getAllIps()

  config.ip = enabled ? bestIp : 'localhost'
  config.ips = enabled ? allIps.map((entry) => entry.address) : []
  config.hostname = enabled ? os.hostname() : 'localhost'
}

async function initLanAccess(db: ApiDb, _helpers: NetworkHelpers, config?: ServerConfig) {
  const envValue = readEnvLanAccess()
  if (envValue !== null) {
    lanEnabled = envValue
    envLocked = true
    return lanEnabled
  }

  envLocked = false

  if (config && typeof config.allowLanAccess === 'string' && config.allowLanAccess !== '') {
    lanEnabled = parseBooleanSetting(config.allowLanAccess, true)
    return lanEnabled
  }

  const settingsRepo = createSettingsRepository(db.drizzle)
  const {row: setting} = settingsRepo.findOrCreateByOption('allowLanAccess', '1')

  lanEnabled = parseBooleanSetting(setting.value, true)

  if (config) {
    config.allowLanAccess = lanEnabled ? '1' : '0'
  }

  return lanEnabled
}

function registerServerNetworkDeps(deps: ServerNetworkDeps) {
  serverDeps = deps
}

async function applyLanAccessChange(enabled: boolean) {
  if (envLocked) {
    throw new Error('LAN access is controlled by MEDIA_CHIPS_ALLOW_LAN environment variable')
  }

  lanEnabled = enabled

  if (!serverDeps) return

  serverDeps.config.allowLanAccess = enabled ? '1' : '0'
  syncNetworkConfig(serverDeps.config, enabled, serverDeps)
  saveConfigFile(serverDeps.configPath, serverDeps.config)
  await serverDeps.restartListener()
}

export {
  initLanAccess,
  isLanAccessEnabled,
  isLanAccessEnvLocked,
  getBindHost,
  syncNetworkConfig,
  registerServerNetworkDeps,
  applyLanAccessChange,
}
