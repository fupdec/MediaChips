import Database from 'better-sqlite3'
import {installSourceProfiles} from '../../services/sourceProfiles'
import {resolveBackupTarget} from '../../services/backupTarget'
import {withLibraryRestore} from '../../services/libraryMaintenance'
import crypto from 'node:crypto'
import type { Express } from 'express'
import { HttpError, sendAsClientError, sendControllerError, sendOk } from '../../types/errors'
import type { ApiRequest, ApiResponse } from '../../types/http'
import type { BackupEntry } from '@shared/api/responses'
import type { ApiDb } from '../../types/db'
import fs from 'fs'
import path from 'path'
import StreamZip from 'node-stream-zip'
import fse from 'fs-extra'
import {createLibraryBackup, stageLibraryBackup, replaceLibraryFromStage} from '../../services/libraryBackup'
import { getDatabaseManager } from '../../../app/server/databaseRegistry'
import createTasksMigrateFromLowDbController from './TasksMigrateFromLowDb.controller'
import { normalizeUserPath } from '../../utils/normalizeUserPath'

export function isLowDbSettingsEntry(name: string): boolean {
  const normalized = String(name || '').replace(/\\/g, '/').replace(/^\.\/+/, '')
  return normalized === 'dbs.json' || normalized.endsWith('/dbs.json')
}

export default function (app: Express, db: ApiDb) {
  const targetFor = (req: ApiRequest) => resolveBackupTarget(db, req.query?.databaseId)
  const getBackupsPath = (req: ApiRequest) => path.join(targetFor(req).root, 'backups')
  const archivePath = (req: ApiRequest, value: unknown) => {
    const name = String(value ?? '')
    if (!name || name === '.' || name === '..' || /[\\/]/.test(name)) throw new HttpError(400, 'Invalid backup name')
    return path.join(getBackupsPath(req), name + '.zip')
  }

  const createBackup = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const name = new Date().toISOString().replace(/[:]/g, '-') + '-' + crypto.randomUUID()
      const target = targetFor(req)
      const sqlite = target.active ? db.sqlite : new Database(path.join(target.root, 'db.sqlite'), {readonly: true, fileMustExist: true})
      try {
        await createLibraryBackup(sqlite, target.root, path.join(target.root, 'backups', name + '.zip'))
      } finally { if (!target.active) sqlite.close() }
      sendOk(res)
    } catch (error) { sendControllerError(res, error, 'Failed to create backup') }
  }

  const getBackups = function (req: ApiRequest, res: ApiResponse) {
    const backups: BackupEntry[] = []
    const backupsPath = getBackupsPath(req)
    if (!fs.existsSync(backupsPath)) {
      sendOk(res, backups)
      return
    }
    fs.readdirSync(backupsPath).forEach((file) => {
      const fileName = String(file)
      if (path.extname(fileName) !== '.zip') return
      const pathToFile = path.join(backupsPath, fileName)
      const filestats = fs.statSync(pathToFile)
      const info: BackupEntry = {
        date: path.parse(fileName).name,
        name: fileName,
        size: (filestats.size / 1024 / 1024).toFixed(2)
      }
      backups.push(info)
    })
    sendOk(res, backups)
  };

  const deleteBackup = function (req: ApiRequest, res: ApiResponse) {
    const backupPath = archivePath(req, req.body.name)
    fs.unlink(backupPath, (err: unknown) => {
      if (err) {
        sendControllerError(res, err, 'Failed to delete backup')
      } else sendOk(res)
    })
  }

  const restoreBackupLocked = async (req: ApiRequest) => {
    const target = targetFor(req)
    const dbPath = target.root
    const backupPath = archivePath(req, req.body.name)
    const zip = new StreamZip.async({
      file: backupPath
    })

    const checkLowDbBackup = () => {
      return new Promise(async (resolve: (value?: unknown) => void, reject: (reason?: unknown) => void) => {
        try {
          const entries = await zip.entries();
          let is_low_db = false;
          for (const entry of Object.values(entries) as Array<{name: string}>) {
            if (isLowDbSettingsEntry(entry.name)) {
              is_low_db = true;
              break
            }
          }
          resolve(is_low_db)
        } catch (e) {
          reject(e)
        }
      })
    }
    try {
      const is_low_db_backup = await checkLowDbBackup()
      if (is_low_db_backup) {
        if (!target.active) throw new HttpError(400, 'Activate this database before restoring a legacy backup')
        await zip.close()
        getDatabaseManager().closeConnection()
        const tasksLowDb = createTasksMigrateFromLowDbController(db)
        await tasksLowDb.migrateFromLowDb(backupPath)
        await getDatabaseManager().reloadCurrentDatabase()
        return
      }

      await zip.close()
      // A library may be restored before it has been opened by this version.
      if (!target.active && db.path_databases) {
        const filename = path.join(dbPath, 'db.sqlite')
        if (fs.existsSync(filename)) {
          const previous = new Database(filename, {fileMustExist: true})
          try { installSourceProfiles(previous, db.path_databases, path.basename(dbPath)) }
          finally { previous.close() }
        }
      }
      const stage = await stageLibraryBackup(backupPath, dbPath)
      await replaceLibraryFromStage(dbPath, stage, {
        close: () => { if (target.active) getDatabaseManager().closeConnection() },
        reload: async () => {
          if (target.active) return getDatabaseManager().reloadCurrentDatabase()
          const check = new Database(path.join(dbPath, 'db.sqlite'), {readonly: true, fileMustExist: true})
          try { if (check.pragma('integrity_check', {simple: true}) !== 'ok') throw new Error('Invalid library database') }
          finally { check.close() }
        },
      })
    } catch (e: unknown) {
      console.error('restoreBackup failed:', e)
      try {
        if (target.active) await getDatabaseManager().reloadCurrentDatabase()
      } catch (reloadErr: unknown) {
        console.error('restoreBackup reload failed:', reloadErr)
      }
      throw e
    } finally {
      try {
        await zip.close()
      } catch {
        // archive may already be closed
      }
    }
  };

  const restoreBackup = async (req: ApiRequest, res: ApiResponse) => {
    try {
      await withLibraryRestore(() => restoreBackupLocked(req))
      sendOk(res)
    }
    catch (error) { sendAsClientError(res, error, 'Failed to restore backup') }
  }

  const importBackup = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const fromPath = normalizeUserPath(String(req.body.path ?? ''))
      if (typeof fromPath !== 'string' || !fromPath || !fs.existsSync(fromPath)) {
        throw new HttpError(400, 'File not found')
      }
      const archive = path.basename(fromPath)
      const toPath = path.join(getBackupsPath(req), archive)
      fse.copySync(fromPath, toPath, {overwrite: false})
      sendOk(res)
    } catch (err) {
      sendAsClientError(res, err, 'Failed to import backup')
    }
  }

  const exportBackup = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const archiveName = String(req.body.archive ?? '')
      const destDir = String(req.body.path ?? '')
      const fromPath = archivePath(req, archiveName)
      const toPath = path.join(destDir, archiveName + '.zip')

      if (!fs.existsSync(fromPath)) {
        throw new HttpError(400, `Backup not found: ${archiveName}`)
      }
      if (!fs.existsSync(destDir)) {
        throw new HttpError(400, `Destination folder not found: ${destDir}`)
      }

      await fse.copy(fromPath, toPath, { overwrite: true })
      sendOk(res)
    } catch (err) {
      sendAsClientError(res, err, 'Failed to export backup')
    }
  }

  return {
    createBackup,
    getBackups,
    deleteBackup,
    restoreBackup,
    importBackup,
    exportBackup,
  }
}