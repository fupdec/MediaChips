import type { TaskControllerShared } from '../../types/tasks'
import { sendAsClientError, sendBadRequest, sendControllerError, sendOk, apiErrorMessage } from '../../types/errors'
import type { ApiRequest, ApiResponse } from '../../types/http'
import type { DatabaseSizesResponse } from '@shared/api/responses'
import fs from 'fs'
import path from 'path'
import { rimraf } from 'rimraf'
import { machineId } from 'node-machine-id'
import { getAppConfigPath } from '../../utils/appConfigPath'
import { loadConfigFile, createDefaultConfig } from '../../../app/server/configFile'
import { getDirectorySize } from '../../services/directorySize'
import { copyDatabaseDirectory } from '../../services/duplicateDatabase'
import { importLibraryIntoActive } from '../../services/libraryMerge'
import {
  createStreamAbortSignal,
  setNdjsonStreamHeaders,
  writeNdjson,
} from './ndjsonStreamRunner'

export default function createTasksDatabaseController(shared: TaskControllerShared) {
  const {db, resolveGeneratedFolderPath} = shared

  const rmrf = (folder: string) => rimraf(folder)

  const countBackupArchives = (dbDir: string): number => {
    const backupsPath = path.join(dbDir, 'backups')
    if (!fs.existsSync(backupsPath)) return 0
    try {
      return fs.readdirSync(backupsPath).filter((file) => path.extname(file) === '.zip').length
    } catch {
      return 0
    }
  }

  const deleteDb = async function (req: ApiRequest, res: ApiResponse) {
    const dbDir = path.join(db.path_databases ?? '', String(req.body.id))
    try {
      await rmrf(dbDir)
      sendOk(res, 'successfully deleted')
    } catch (err) {
      sendAsClientError(res, err, 'Request failed')
    }
  }

  const duplicateDb = async function (req: ApiRequest, res: ApiResponse) {
    const sourceId = String(req.body.id ?? '')
    const databasesPath = db.path_databases ?? ''
    if (!sourceId || !databasesPath) {
      sendBadRequest(res, 'Database id required')
      return
    }

    const sourceDir = path.join(databasesPath, sourceId)
    if (!fs.existsSync(sourceDir)) {
      sendBadRequest(res, 'Source database folder not found')
      return
    }

    const configPath = getAppConfigPath()
    const loaded = loadConfigFile(configPath)
    const config = loaded.config || createDefaultConfig()
    const sourceEntry = (config.databases || []).find((entry) => entry.id === sourceId)
    if (!sourceEntry) {
      sendBadRequest(res, 'Source database not found in config')
      return
    }

    const includeGeneratedCache = req.body.includeGeneratedCache !== false
    const requestedName = typeof req.body.name === 'string' ? req.body.name.trim() : ''
    const name = requestedName || `${sourceEntry.name} (copy)`
    const icon = typeof req.body.icon === 'string' && req.body.icon.trim()
      ? req.body.icon.trim()
      : sourceEntry.icon

    const newId = Date.now().toString(16)
    const destDir = path.join(databasesPath, newId)

    try {
      const isActiveSource = db.config?.id === sourceId || Boolean(sourceEntry.active)
      if (isActiveSource && db.sqlite) {
        try {
          db.sqlite.pragma('wal_checkpoint(TRUNCATE)')
        } catch (error) {
          console.warn('duplicateDb wal_checkpoint failed:', error)
        }
      }

      await copyDatabaseDirectory({
        sourceDir,
        destDir,
        includeGeneratedCache,
      })

      const database = {
        id: newId,
        name,
        active: false,
        createdAt: Date.now(),
        ...(icon ? {icon} : {}),
      }

      sendOk(res, {database})
    } catch (err) {
      sendAsClientError(res, err, 'Failed to duplicate database')
    }
  }

  const getDatabaseSizes = async function (req: ApiRequest, res: ApiResponse) {
    const ids = req.body.ids as Array<string | number>

    try {
      const sizes: DatabaseSizesResponse['sizes'] = {}
      const backupCounts: NonNullable<DatabaseSizesResponse['backupCounts']> = {}
      await Promise.all(ids.map(async (id) => {
        const key = String(id)
        const dbDir = path.join(db.path_databases ?? '', key)
        sizes![key] = await getDirectorySize(dbDir)
        backupCounts[key] = countBackupArchives(dbDir)
      }))
      const payload: DatabaseSizesResponse = { sizes, backupCounts }
      sendOk(res, payload)
    } catch (err) {
      sendAsClientError(res, err, 'Request failed')
    }
  }

  const getFolderSize = async function (req: ApiRequest, res: ApiResponse) {
    const dirPath = resolveGeneratedFolderPath(req.body.folder)
    if (!dirPath) {
      sendBadRequest(res, 'Unknown folder type')
      return
    }

    const size = await getDirectorySize(dirPath)
    sendOk(res, {size})
  }

  const clearData = async function (req: ApiRequest, res: ApiResponse) {
    const imageType = String(req.body.imageType ?? '')
    const delPath = resolveGeneratedFolderPath(imageType)

    if (!delPath) {
      sendBadRequest(res, 'Unknown folder type')
      return
    }

    try {
      await rmrf(delPath)
      if (!fs.existsSync(delPath)) fs.mkdirSync(delPath, {recursive: true})
      if (imageType === 'faces' && db.sqlite) {
        db.sqlite.prepare('DELETE FROM faces').run()
      }
      sendOk(res)
    } catch (err) {
      sendAsClientError(res, err, 'Request failed')
    }
  }

  const getConfig = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const configPath = getAppConfigPath()
      const result = loadConfigFile(configPath)
      const config_json = result.config || createDefaultConfig()
      sendOk(res, config_json)
    } catch (error) {
      sendControllerError(res, error, 'Failed to read config')
    }
  }

  const getMachineId = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const id = await machineId()
      sendOk(res, id)
    } catch (error) {
      console.error('getMachineId failed:', error)
      sendControllerError(res, error, 'Failed to get machine id')
    }
  }

  const streamMergeLibrary = async function (req: ApiRequest, res: ApiResponse) {
    const writeEvent = (event: Record<string, unknown>) => writeNdjson(res, event)

    try {
      setNdjsonStreamHeaders(res)

      const sourceDatabaseId = String(req.body?.sourceDatabaseId ?? '').trim()
      const databasesPath = db.path_databases ?? ''
      if (!sourceDatabaseId || !databasesPath) {
        writeEvent({type: 'error', message: 'Source database id required'})
        res.end()
        return
      }

      if (db.config?.id && String(db.config.id) === sourceDatabaseId) {
        writeEvent({type: 'error', message: 'Cannot import a library into itself'})
        res.end()
        return
      }

      const configPath = getAppConfigPath()
      const loaded = loadConfigFile(configPath)
      const config = loaded.config || createDefaultConfig()
      const sourceEntry = (config.databases || []).find((entry) => entry.id === sourceDatabaseId)
      if (!sourceEntry) {
        writeEvent({type: 'error', message: 'Source database not found in config'})
        res.end()
        return
      }

      const sourceDir = path.join(databasesPath, sourceDatabaseId)
      const sourceDbFile = path.join(sourceDir, 'db.sqlite')
      if (!fs.existsSync(sourceDbFile)) {
        writeEvent({type: 'error', message: 'Source database file not found'})
        res.end()
        return
      }

      const copyGeneratedAssets = req.body?.copyGeneratedAssets !== false
        && req.body?.copyGeneratedAssets !== 0
        && req.body?.copyGeneratedAssets !== '0'

      const isAborted = createStreamAbortSignal(req, res)

      writeEvent({
        type: 'progress',
        phase: 'starting',
        processed: 0,
        total: 0,
      })

      const result = await importLibraryIntoActive(
        db,
        sourceDatabaseId,
        {copyGeneratedAssets},
        (event) => writeEvent(event as unknown as Record<string, unknown>),
        isAborted,
      )

      writeEvent({
        type: 'complete',
        ...result,
      })
      res.end()
    } catch (err) {
      writeEvent({
        type: 'error',
        message: apiErrorMessage(err) || 'Library merge failed',
      })
      res.end()
    }
  }

  return {
    deleteDb,
    duplicateDb,
    streamMergeLibrary,
    getDatabaseSizes,
    getFolderSize,
    clearData,
    getConfig,
    getMachineId,
  }
}
