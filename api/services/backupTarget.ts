import path from 'node:path'
import {HttpError} from '../types/errors'
import type {ApiDb} from '../types/db'
import {getAppConfigPath} from '../utils/appConfigPath'
import {loadConfigFile} from '../../app/server/configFile'

export function resolveBackupTarget(db: ApiDb, databaseId?: unknown) {
  const id = databaseId == null ? db.config?.id : String(databaseId)
  if (!id || id === db.config?.id) {
    if (!db.path) throw new HttpError(400, 'Database path is not configured')
    return {root: db.path, active: true}
  }
  const config = loadConfigFile(getAppConfigPath()).config
  if (!db.path_databases || !config?.databases.some(entry => entry.id === id)
    || path.basename(id) !== id || id === '..') throw new HttpError(404, 'Database not found')
  return {root: path.join(db.path_databases, id), active: false}
}
