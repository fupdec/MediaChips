import path from 'path'
import {randomUUID} from 'crypto'
import {eq} from 'drizzle-orm'
import type {ApiDb} from '../../types/db'
import {media} from '../../db/schema/media'
import {sourceCatalogEntries, sourceCatalogRoots, sourceConnections, mediaLocations} from '../../db/schema/mediaSources'
import {createMediaRepository} from '../../db/repositories/media'
import {createMediaTypesRepository} from '../../db/repositories/mediaTypes'
import {createVideoMetadataRepository} from '../../db/repositories/videoMetadata'
import {mediaFileKind} from '../../../shared/mediaFormats'
import {driveMediaPath} from '../../../shared/cloudDrive'
import {nasMediaPath} from '../../../shared/remoteMedia'
import type {CatalogResult} from '../../../shared/sourceCatalog'
import {nasVersionMatches} from './locations'
import {normalizeNasRelativePath} from '../nas/transport'
import {invalidateMediaDerivedCaches} from '../mediaCacheInvalidation'
import {sourceError} from './context'
import type {SourceObject, SourceReadAdapter} from './adapter'

/** A failed page, repeated continuation or aborted walk produces no catalog writes. */
export async function collectCatalog(adapter: SourceReadAdapter, rootKey: string, signal: AbortSignal, progress: (count: number) => void) {
  const files = new Map<string, SourceObject>()
  const pending = [rootKey]
  const directories = new Set<string>()
  let count = 0
  while (pending.length) {
    signal.throwIfAborted()
    const key = pending.pop()!
    if (directories.has(key)) continue
    directories.add(key)
    let token: string | undefined
    const tokens = new Set<string>()
    do {
      signal.throwIfAborted()
      const page = await adapter.list(key, token, signal)
      signal.throwIfAborted()
      for (const entry of page.entries) {
        if (++count > 500_000) throw sourceError('catalog_too_large')
        if (adapter.provider === 'nas') {
          const normalized = normalizeNasRelativePath(entry.resourceKey)
          if (normalized !== entry.resourceKey || (rootKey && !normalized.startsWith(`${rootKey}/`))) throw sourceError('invalid_inventory')
        }
        if (entry.isDirectory) pending.push(entry.resourceKey)
        else {
          if (!Number.isSafeInteger(entry.size) || entry.size < 0 || !entry.version) throw sourceError('invalid_inventory')
          const previous = files.get(entry.resourceKey)
          if (previous && (previous.version !== entry.version || previous.size !== entry.size)) throw sourceError('source_changed')
          files.set(entry.resourceKey, entry)
        }
      }
      progress(count)
      token = page.nextPageToken
      if (token && tokens.has(token)) throw sourceError('invalid_pagination')
      if (token) tokens.add(token)
    } while (token)
  }
  signal.throwIfAborted()
  return files
}

/** Synchronous commit. Only source observations and technical file size may change. */
export function commitCatalog(db: ApiDb, rootId: string, files: Map<string, SourceObject>, signal: AbortSignal): CatalogResult {
  signal.throwIfAborted()
  const root = db.drizzle.select().from(sourceCatalogRoots).where(eq(sourceCatalogRoots.id, rootId)).get()
  if (!root) throw sourceError('root_not_found', 404)
  const connection = db.drizzle.select().from(sourceConnections).where(eq(sourceConnections.id, root.connectionId)).get()
  if (!connection) throw sourceError('connection_not_found', 404)
  const result: CatalogResult = {new: 0, changed: 0, missing: 0, scanned: files.size, changes: [], truncated: false}
  const report = (kind: 'new' | 'changed' | 'missing', key: string, name: string, mediaId: number) => {
    result[kind]++
    if (result.changes.length < 500) result.changes.push({kind, resourceKey: key, name, mediaId})
    else result.truncated = true
  }
  db.drizzle.transaction(tx => {
    const repo = createMediaRepository(tx)
    const locations = tx.select().from(mediaLocations).where(eq(mediaLocations.connectionId, root.connectionId)).all()
    // Most recent import is the current card when a legacy source has multiple versions.
    const byKey = new Map<string, (typeof locations)[number]>()
    for (const row of locations) {
      if (row.availability === 'available' || byKey.get(row.resourceKey)?.availability !== 'available') byKey.set(row.resourceKey, row)
    }
    const allByKey = new Map<string, typeof locations>()
    for (const row of locations) {
      const group = allByKey.get(row.resourceKey) || []
      group.push(row); allByKey.set(row.resourceKey, group)
    }
    const known = new Map(tx.select().from(sourceCatalogEntries).where(eq(sourceCatalogEntries.rootId, rootId)).all().map(row => [row.resourceKey, row.name]))
    // NAS paths allow an initial baseline. Drive IDs acquire root membership on the first complete walk.
    if (connection.provider === 'nas') for (const row of locations) {
      if (!root.rootKey || row.resourceKey.startsWith(`${root.rootKey}/`)) known.set(row.resourceKey, path.posix.basename(row.resourceKey))
    }
    const verifiedAt = new Date().toISOString()
    for (const [key, file] of files) {
      const previous = byKey.get(key)
      const matches = (version: string) => connection.provider === 'nas' ? nasVersionMatches(version, file.version) : version === file.version
      const group = allByKey.get(key) || []
      const location = group.find(row => row.version === file.version) || group.find(row => matches(row.version)) || previous
      let card = location ? repo.findById(location.mediaId) : undefined
      const mediaPath = connection.provider === 'nas' ? nasMediaPath(root.connectionId, key) : driveMediaPath(key)
      if (!card) card = repo.findByPathVariants([mediaPath])
      // A complete refresh must never resurrect something the user put in Trash.
      const trashed = tx.select().from(media).where(eq(media.trashOriginalPath, mediaPath)).get()
      if (card?.deletedAt || trashed) continue
      if (!card) {
        const kind = mediaFileKind(file.name)
        if (!kind || !file.size) continue
        const type = createMediaTypesRepository(tx).findByType(kind)
        if (!type) throw sourceError('media_type_unavailable')
        card = repo.findOrCreateByPath(mediaPath, {name: file.name, basename: file.name, filesize: file.size,
          ext: path.posix.extname(file.name).slice(1).toLowerCase(), mediaTypeId: type.id}).row
        if (kind !== 'image') createVideoMetadataRepository(tx).create({mediaId: card.id, duration: 0})
        report('new', key, file.name, card.id)
      } else if (previous && !matches(previous.version)) {
        report('changed', key, file.name, card.id)
      }
      for (const alternative of group) if (alternative.id !== location?.id && !matches(alternative.version)) {
        tx.update(mediaLocations).set({availability: 'unavailable', lastVerifiedAt: verifiedAt}).where(eq(mediaLocations.id, alternative.id)).run()
      }
      if (location) tx.update(mediaLocations).set({version: file.version, availability: 'available', lastVerifiedAt: verifiedAt}).where(eq(mediaLocations.id, location.id)).run()
      else tx.insert(mediaLocations).values({id: randomUUID(), mediaId: card.id, connectionId: root.connectionId,
        resourceKey: key, version: file.version, availability: 'available', lastVerifiedAt: verifiedAt}).run()
      // User name, chips, values, ratings, marks and membership are deliberately never patched.
      if (card.filesize !== file.size) repo.updateById(card.id, {filesize: file.size})
      tx.insert(sourceCatalogEntries).values({rootId, resourceKey: key, version: file.version, name: file.name})
        .onConflictDoUpdate({target: [sourceCatalogEntries.rootId, sourceCatalogEntries.resourceKey], set: {version: file.version, name: file.name}}).run()
    }
    for (const [key, name] of known) {
      if (files.has(key)) continue
      const matching = allByKey.get(key) || []
      let reported = false
      for (const location of matching) {
        if (repo.findById(location.mediaId)?.deletedAt) continue
        if (!reported) { report('missing', key, name, location.mediaId); reported = true }
        tx.update(mediaLocations).set({availability: 'unavailable', lastVerifiedAt: verifiedAt}).where(eq(mediaLocations.id, location.id)).run()
      }
    }
    signal.throwIfAborted()
    tx.update(sourceCatalogRoots).set({lastCompletedAt: verifiedAt, lastError: null, lastResult: JSON.stringify(result)})
      .where(eq(sourceCatalogRoots.id, rootId)).run()
  })
  invalidateMediaDerivedCaches()
  return result
}
