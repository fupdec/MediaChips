import path from 'path'
import {randomUUID} from 'crypto'
import {eq, and} from 'drizzle-orm'
import type {ApiDb} from '../../types/db'
import {media, mediaLocations, sourceConnections} from '../../db/schema'
import {createMediaRepository} from '../../db/repositories/media'
import {createMediaTypesRepository} from '../../db/repositories/mediaTypes'
import {fillCloudMediaMetadata} from './libraryMetadata'
import {cloudMediaPath, type CloudProvider} from '../../../shared/cloudAccounts'
import {mediaFileKind} from '../../../shared/mediaFormats'
import {pinSourceDb, sourceError} from '../mediaSources/context'
import type {SourceReadAdapter} from '../mediaSources/adapter'
import {invalidateMediaDerivedCaches} from '../mediaCacheInvalidation'

export async function importCloudFile(db: ApiDb, connectionId: string, key: string, adapter: SourceReadAdapter, signal?: AbortSignal) {
  const pinned = pinSourceDb(db)
  const connection = pinned.db.drizzle.select().from(sourceConnections).where(eq(sourceConnections.id, connectionId)).get()
  if (!connection || connection.provider !== adapter.provider) throw sourceError('account_not_found', 404)
  const file = await adapter.stat(key, signal)
  signal?.throwIfAborted(); pinned.assertCurrent()
  const kind = mediaFileKind(file.name)
  if (file.isDirectory || !kind || !file.contentType.startsWith(`${kind}/`) || !Number.isSafeInteger(file.size) || file.size <= 0) throw sourceError('unsupported_media', 415)
  const type = createMediaTypesRepository(pinned.db.drizzle).findByType(kind)
  if (!type) throw sourceError('media_type_unavailable', 400)
  const mediaPath = cloudMediaPath(connection.provider as CloudProvider, connectionId, file.resourceKey)
  const repo = createMediaRepository(pinned.db.drizzle)
  if (repo.findByPathVariants([mediaPath])?.deletedAt || pinned.db.drizzle.select().from(media).where(eq(media.trashOriginalPath, mediaPath)).get()) throw sourceError('media_in_trash')
  const result = pinned.db.drizzle.transaction(() => {
    const result = repo.findOrCreateByPath(mediaPath, {name: file.name, basename: file.name, ext: path.posix.extname(file.name).slice(1).toLowerCase(), filesize: file.size, mediaTypeId: type.id})
    fillCloudMediaMetadata(pinned.db, result.row.id, kind, file)
    const location = pinned.db.drizzle.select().from(mediaLocations).where(and(eq(mediaLocations.connectionId, connectionId), eq(mediaLocations.resourceKey, file.resourceKey))).get()
    const values = {version: file.version, availability: 'available' as const, lastVerifiedAt: new Date().toISOString()}
    if (location) pinned.db.drizzle.update(mediaLocations).set(values).where(eq(mediaLocations.id, location.id)).run()
    else pinned.db.drizzle.insert(mediaLocations).values({id: randomUUID(), mediaId: result.row.id, connectionId, resourceKey: file.resourceKey, ...values}).run()
    return {id: result.row.id, title: result.row.name || file.name, created: result.created}
  })
  invalidateMediaDerivedCaches()
  return result
}
