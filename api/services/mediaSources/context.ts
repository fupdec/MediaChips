import {assertLibraryOperationCurrent} from '../libraryMaintenance'
import {getCloudAccounts} from '../cloudAccounts/accounts'
import {eq} from 'drizzle-orm'
import type {ApiDb} from '../../types/db'
import {getActiveConnection, getSqliteProxy} from '../../db/connectionHolder'
import {sourceConnections} from '../../db/schema/mediaSources'
import {NasConnectionSchema} from '../../../shared/nas'
import {getCloudDriveService} from '../cloudDrive'
import {createNasCredentialStore} from '../nas/credentials'
import {connectNas} from '../nas/transport'
import {createNasSourceAdapter} from './nasAdapter'
import {createDriveSourceAdapter} from './driveAdapter'
import type {SourceWriteAdapter} from './adapter'

export const sourceError = (code: string, status = 409) => Object.assign(new Error(code), {code, status})

/** The public DB uses stable proxies. Pin the actual connection across every await. */
export function pinSourceDb(db: ApiDb) {
  assertLibraryOperationCurrent()
  const active = db.sqlite === getSqliteProxy() ? getActiveConnection() : null
  const pinned: ApiDb = active ? {...db, ...active} : {...db}
  const library = db.path
  return {db: pinned, assertCurrent() {
    assertLibraryOperationCurrent()
    if (db.path !== library || (active && getActiveConnection() !== active)) throw sourceError('library_changed')
  }}
}

export async function openSource(db: ApiDb, connectionId: string, signal: AbortSignal): Promise<SourceWriteAdapter> {
  const row = db.drizzle.select().from(sourceConnections).where(eq(sourceConnections.id, connectionId)).get()
  if (!row) throw sourceError('connection_not_found', 404)
  signal.throwIfAborted()
  if (row.provider !== 'nas' && row.credentialRef === row.id) return getCloudAccounts().adapter(db, connectionId)
  if (row.provider === 'gdrive') {
    const service = getCloudDriveService()
    if (!service.status().authenticated) throw sourceError('auth_required')
    return createDriveSourceAdapter(service.transport, service.status().capabilities.move)
  }
  const credentials = createNasCredentialStore().get(row.credentialRef)
  return createNasSourceAdapter(await connectNas(NasConnectionSchema.parse(JSON.parse(row.config)), credentials, signal))
}
