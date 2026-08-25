import type { ServerConfig, ServerDatabaseEntry, NetworkIpInfo, NetworkHelpers } from '../types/server'
import {projectPath} from '../../shared/projectRoot'
import { apiErrorMessage } from '../../api/types/errors'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { loadConfigFile, createDefaultConfig, saveConfigFile } from './configFile'
import { resolveListenPort } from './ports'
import { pickPublicHost } from './publicHost'
import { discoverDatabaseEntries } from './databaseDiscovery'

/** Prefer MEDIA_CHIPS_DATA_DIR so Electron-spawned Node children never need process.electron_app. */
export function resolveServerAppFolder(options: {
  dataDir?: string | null
  isElectron?: boolean
  portableExecutableDir?: string | null
  getUserDataPath?: () => string
} = {}): {appFolder?: string; usedDataDir: boolean} {
  const dataDir = options.dataDir?.trim()
    || process.env.MEDIA_CHIPS_DATA_DIR?.trim()
    || ''
  if (dataDir) {
    return {appFolder: path.resolve(dataDir), usedDataDir: true}
  }

  const isElectron = options.isElectron ?? Boolean(process.versions.electron)
  if (!isElectron) return {appFolder: undefined, usedDataDir: false}

  const portable = options.portableExecutableDir
    ?? process.env.PORTABLE_EXECUTABLE_DIR
    ?? ''
  if (portable) {
    return {appFolder: portable, usedDataDir: false}
  }

  const getUserDataPath = options.getUserDataPath
    || (() => process.electron_app!.getPath('userData'))
  return {appFolder: getUserDataPath(), usedDataDir: false}
}

function migrateLegacyDatabasesFolder(appFolder: string) {
  const oldDbPath = path.join(appFolder, 'databases')
  const newDbPath = path.join(appFolder, 'app_storage')
  if (!fs.existsSync(oldDbPath)) return

  try {
    fs.renameSync(oldDbPath, newDbPath)
    console.log('Data successfully preserved and moved to app_storage')
  } catch (err: unknown) {
    console.error('Error while preserving data:', err)
  }
}

function initializeServerConfig({getBestLocalIp, getAllIps}: NetworkHelpers) {
  let app_folder: string | undefined
  const is_electron_running = Boolean(process.versions.electron)
  const {appFolder, usedDataDir} = resolveServerAppFolder({
    isElectron: is_electron_running,
  })

  if (appFolder) {
    app_folder = appFolder
    process.app_folder = app_folder
    fs.mkdirSync(app_folder, {recursive: true})
    // Electron shell and MEDIA_CHIPS_DATA_DIR (child / Docker) share this layout.
    if (is_electron_running || usedDataDir) {
      migrateLegacyDatabasesFolder(app_folder)
    }
  }

  let configPath
  if (app_folder) {
    configPath = path.join(app_folder, 'config.json')
  } else {
    configPath = projectPath('public', 'config.json')
  }

  console.log('\x1b[33m%s\x1b[0m', '=== SERVER SETUP ===')

  const loadResult = loadConfigFile(configPath)
  let config = loadResult.config

  if (config) {
    if (loadResult.source === 'main') {
      console.log('\x1b[33m%s\x1b[0m', `Config loaded from ${configPath}`)
    } else if (loadResult.source === 'backup') {
      console.log('\x1b[33m%s\x1b[0m', `Config restored from backup for ${configPath}`)
      if (loadResult.preservedCorruptedAs) {
        console.log('\x1b[33m%s\x1b[0m', `Corrupted config preserved as ${loadResult.preservedCorruptedAs}`)
      }
    }
  } else {
    console.log('\x1b[33m%s\x1b[0m', 'Creating new config...')
    if (loadResult.preservedCorruptedAs) {
      console.log('\x1b[33m%s\x1b[0m', `Corrupted config preserved as ${loadResult.preservedCorruptedAs}`)
    }
    if (loadResult.error) {
      console.log('\x1b[33m%s\x1b[0m', `Previous config error: ${loadResult.error}`)
    }
    config = createDefaultConfig()
  }

  const allIpsInfo = getAllIps()
  const bestIp = pickPublicHost({getBestLocalIp, getAllIps}, {})

  config.ip = bestIp
  config.ips = allIpsInfo.map((ip: NetworkIpInfo) => ip.address)
  config.hostname = os.hostname()
  // Keep a previously saved Electron port override; fall back to the default.
  config.port = resolveListenPort(config.port)

  const configDir = path.dirname(configPath)
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, {recursive: true})
  }

  let databasesPath
  if (app_folder) {
    databasesPath = path.join(app_folder, 'app_storage')
  } else {
    databasesPath = projectPath('app_storage')
  }

  const discoveredDatabases = discoverDatabaseEntries(databasesPath, config.databases)
  if (discoveredDatabases.length > 0) {
    config.databases.push(...discoveredDatabases)
    console.log('\x1b[33m%s\x1b[0m', `Discovered ${discoveredDatabases.length} database(s) on disk`)
  }

  const activeDb = config.databases.find((db: ServerDatabaseEntry) => db.active)
  if (!activeDb && config.databases.length > 0) {
    config.databases[0].active = true
    console.log('\x1b[33m%s\x1b[0m', `Activated first database: ${config.databases[0].name}`)
  }

  const currentActiveDb = config.databases.find((db: ServerDatabaseEntry) => db.active)
  if (currentActiveDb) {
    config.path = path.join(databasesPath, currentActiveDb.id)
    console.log('\x1b[36m%s\x1b[0m', `Active database: ${currentActiveDb.name} (${currentActiveDb.id})`)
    console.log('\x1b[36m%s\x1b[0m', `Database path: ${config.path}`)
  } else {
    console.error('\x1b[31m%s\x1b[0m', '❌ Failed to determine active database')
    config.path = path.join(databasesPath, config.databases[0]?.id || 'default')
  }

  saveConfigFile(configPath, config)
  console.log('\x1b[32m%s\x1b[0m', `✅ Config saved. Primary IP: ${bestIp}, Port: ${config.port}`)

  createStorageDirectories(config, databasesPath)

  return {
    config,
    configPath,
    databasesPath,
    app_folder,
    is_electron_running,
    bestIp,
    allIpsInfo,
  }
}

function createStorageDirectories(config: ServerConfig, databasesPath: string) {
  let userDirs = [databasesPath]

  for (const db of config.databases) {
    const dbPath = path.join(databasesPath, db.id)
    const mediaPath = path.join(dbPath, 'media')
    const metaPath = path.join(dbPath, 'meta')
    const backupPath = path.join(dbPath, 'backups')
    const videoPath = path.join(mediaPath, 'videos')
    const imagePath = path.join(mediaPath, 'images')
    const audioPath = path.join(mediaPath, 'audios')
    const textPath = path.join(mediaPath, 'texts')

    const videoSubDirs = ['thumbs', 'marks', 'grids'].map(subDir =>
      path.join(videoPath, subDir),
    )

    userDirs = [...userDirs, dbPath, mediaPath, metaPath, backupPath,
      videoPath, imagePath, audioPath, textPath, ...videoSubDirs]
  }

  for (const dir of userDirs) {
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, {recursive: true})
      } catch (err: unknown) {
        console.log('\x1b[31m%s\x1b[0m', `❌ Error creating directory ${dir}:`, err instanceof Error ? apiErrorMessage(err) : String(err))
      }
    }
  }
}

export { initializeServerConfig, createStorageDirectories }
