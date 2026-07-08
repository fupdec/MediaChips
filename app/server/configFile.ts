import type { ServerConfig, ServerDatabaseEntry } from '../types/server'
import { apiErrorMessage } from '../../api/types/errors'
import fs from 'fs'
import path from 'path'
import { FIXED_PORT } from './ports'

export type ConfigFileRecord = ServerConfig & Record<string, unknown>

export type ConfigLoadSource = 'main' | 'backup' | 'default'

export type ConfigLoadResult = {
  config: ConfigFileRecord | null
  source: ConfigLoadSource
  error?: string
  preservedCorruptedAs?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function getConfigBackupPath(configPath: string): string {
  return `${configPath}.bak`
}

function getCorruptedConfigPath(configPath: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `${configPath}.corrupted-${stamp}`
}

function parseJson(raw: string): unknown {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error('Config file is empty')
  }
  return JSON.parse(trimmed)
}

function normalizeDatabaseEntry(entry: unknown, index: number): ServerDatabaseEntry | null {
  if (!isRecord(entry)) return null

  const id = typeof entry.id === 'string' && entry.id.trim()
    ? entry.id.trim()
    : Date.now().toString(16) + index.toString(16)

  const name = typeof entry.name === 'string' && entry.name.trim()
    ? entry.name.trim()
    : 'Default'

  const icon = typeof entry.icon === 'string' && entry.icon.trim()
    ? entry.icon.trim()
    : undefined

  return {
    id,
    name,
    active: entry.active === true,
    createdAt: typeof entry.createdAt === 'number' && Number.isFinite(entry.createdAt)
      ? entry.createdAt
      : Date.now(),
    ...(icon ? {icon} : {}),
  }
}

export function normalizeServerConfig(data: unknown, fixedPort = FIXED_PORT): ConfigFileRecord | null {
  if (!isRecord(data)) return null

  const databasesRaw = Array.isArray(data.databases) ? data.databases : []
  const databases = databasesRaw
    .map((entry, index) => normalizeDatabaseEntry(entry, index))
    .filter((entry): entry is ServerDatabaseEntry => entry !== null)

  if (databases.length === 0) return null

  let activeCount = 0
  for (const database of databases) {
    if (database.active) activeCount += 1
  }
  if (activeCount === 0) {
    databases[0].active = true
  } else if (activeCount > 1) {
    let keptActive = false
    for (const database of databases) {
      if (!database.active) continue
      if (keptActive) {
        database.active = false
      } else {
        keptActive = true
      }
    }
  }

  const port = typeof data.port === 'number' && Number.isFinite(data.port)
    ? data.port
    : fixedPort

  const ips = Array.isArray(data.ips)
    ? data.ips.filter((value): value is string => typeof value === 'string')
    : undefined

  return {
    ...data,
    port,
    ips,
    databases,
  } as ConfigFileRecord
}

function readAndNormalize(configPath: string): ConfigFileRecord {
  const raw = fs.readFileSync(configPath, 'utf8')
  const parsed = parseJson(raw)
  const normalized = normalizeServerConfig(parsed)
  if (!normalized) {
    throw new Error('Config structure is invalid')
  }
  return normalized
}

function preserveCorruptedFile(configPath: string): string | undefined {
  if (!fs.existsSync(configPath)) return undefined

  const corruptedPath = getCorruptedConfigPath(configPath)
  try {
    fs.copyFileSync(configPath, corruptedPath)
    return corruptedPath
  } catch (err: unknown) {
    console.error('\x1b[33m%s\x1b[0m', '⚠️ Failed to preserve corrupted config:', err instanceof Error ? apiErrorMessage(err) : String(err))
    return undefined
  }
}

export function loadConfigFile(configPath: string): ConfigLoadResult {
  const backupPath = getConfigBackupPath(configPath)
  let lastError = 'Config file not found'

  if (fs.existsSync(configPath)) {
    try {
      const config = readAndNormalize(configPath)
      return {config, source: 'main'}
    } catch (err: unknown) {
      lastError = err instanceof Error ? apiErrorMessage(err) : String(err)
      console.error('\x1b[33m%s\x1b[0m', `⚠️ Failed to load ${configPath}:`, lastError)
    }
  }

  if (fs.existsSync(backupPath)) {
    try {
      const config = readAndNormalize(backupPath)
      const preservedCorruptedAs = fs.existsSync(configPath) ? preserveCorruptedFile(configPath) : undefined
      console.log('\x1b[33m%s\x1b[0m', `✅ Config restored from backup: ${backupPath}`)
      return {
        config,
        source: 'backup',
        error: lastError,
        preservedCorruptedAs,
      }
    } catch (err: unknown) {
      lastError = err instanceof Error ? apiErrorMessage(err) : String(err)
      console.error('\x1b[33m%s\x1b[0m', `⚠️ Failed to load backup ${backupPath}:`, lastError)
    }
  }

  const preservedCorruptedAs = fs.existsSync(configPath) ? preserveCorruptedFile(configPath) : undefined
  return {
    config: null,
    source: 'default',
    error: lastError,
    preservedCorruptedAs,
  }
}

export function createDefaultConfig(): ConfigFileRecord {
  return {
    port: FIXED_PORT,
    databases: [{
      id: Date.now().toString(16),
      name: 'Default',
      active: true,
      createdAt: Date.now(),
    }],
  }
}

export function saveConfigFile(configPath: string, config: ConfigFileRecord | ServerConfig | Record<string, unknown>) {
  const normalized = normalizeServerConfig(config)
  if (!normalized) {
    throw new Error('Refusing to save invalid config')
  }

  const configDir = path.dirname(configPath)
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, {recursive: true})
  }

  const backupPath = getConfigBackupPath(configPath)
  if (fs.existsSync(configPath)) {
    fs.copyFileSync(configPath, backupPath)
  }

  const payload = JSON.stringify(normalized, null, 2)
  const tempPath = `${configPath}.tmp`
  fs.writeFileSync(tempPath, payload, 'utf8')
  fs.renameSync(tempPath, configPath)
}

