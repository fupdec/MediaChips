import type { ApiDb } from '../../api/types/db'
import type { ServerConfig, ServerDatabaseEntry } from '../types/server'
import { apiErrorMessage } from '../../api/types/errors'
import path from 'path'
import fs from 'fs'
import {
  createDrizzleClient,
  closeActiveConnection,
  setActiveConnection,
} from '../../api/db'
import { bootstrapDatabase } from '../../api/db/migrationRunner'
import { scheduleLegacyTimelineCleanup } from '../../api/services/legacyTimelineCleanup'
import { saveConfigFile } from './configFile'
import { createStorageDirectories } from './serverConfig'

type TranscodeManagerLike = {
  stopAllLiveStreams(): void
  clearCacheForActiveDb(): unknown
} | null | undefined

export type DatabaseManagerDeps = {
  db: ApiDb
  config: ServerConfig
  configPath: string
  databasesPath: string
  transcodeManager?: TranscodeManagerLike
  onDatabaseChanged?: () => void
}

function removeSqliteFiles(dbFilePath: string) {
  for (const file of [dbFilePath, `${dbFilePath}-wal`, `${dbFilePath}-shm`]) {
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file)
      }
    } catch (err: unknown) {
      console.log('\x1b[33m%s\x1b[0m', `⚠️ Failed to remove ${file}:`, err instanceof Error ? apiErrorMessage(err) : String(err))
    }
  }
}

export function createDatabaseManager(deps: DatabaseManagerDeps) {
  async function applyConnection(dbConfig: ServerDatabaseEntry) {
    createStorageDirectories(deps.config, deps.databasesPath)

    const folderPath = path.join(deps.databasesPath, dbConfig.id)
    const dbFilePath = path.join(folderPath, 'db.sqlite')

    console.log('\x1b[36m%s\x1b[0m', `Reconnecting to database: ${dbConfig.name} (${dbConfig.id})`)

    deps.transcodeManager?.stopAllLiveStreams()
    closeActiveConnection()

    const connection = createDrizzleClient(dbFilePath)
    setActiveConnection(connection)

    deps.db.path = folderPath
    deps.db.config = dbConfig
    deps.db.path_databases = deps.databasesPath

    await bootstrapDatabase(dbFilePath)
    scheduleLegacyTimelineCleanup(deps.db)

    deps.onDatabaseChanged?.()
    deps.transcodeManager?.clearCacheForActiveDb()

    console.log('\x1b[32m%s\x1b[0m', `✅ Database reconnected: ${dbConfig.name}`)
  }

  async function switchToDatabase(databaseId: string): Promise<ServerDatabaseEntry> {
    const database = deps.config.databases.find((entry: ServerDatabaseEntry) => entry.id === databaseId)
    if (!database) {
      throw new Error('Database not found')
    }

    deps.config.databases.forEach((entry: ServerDatabaseEntry) => {
      entry.active = false
    })
    database.active = true
    deps.config.path = path.join(deps.databasesPath, database.id)

    saveConfigFile(deps.configPath, deps.config)

    await applyConnection(database)
    return database
  }

  async function reloadCurrentDatabase(): Promise<ServerDatabaseEntry> {
    const active = deps.config.databases.find((entry: ServerDatabaseEntry) => entry.active)
    if (!active) {
      throw new Error('No active database')
    }

    await applyConnection(active)
    return active
  }

  function closeConnection() {
    deps.transcodeManager?.stopAllLiveStreams()
    closeActiveConnection()
  }

  return {
    switchToDatabase,
    reloadCurrentDatabase,
    closeConnection,
    removeSqliteFiles,
  }
}

export type DatabaseManager = ReturnType<typeof createDatabaseManager>
