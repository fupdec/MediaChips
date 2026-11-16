import fs from 'fs'
import path from 'path'
import {randomUUID} from 'crypto'
import {and, eq} from 'drizzle-orm'
import type {ApiDb} from '../../types/db'
import {media} from '../../db/schema/media'
import {mediaLocations} from '../../db/schema/mediaSources'
import {verifiedMediaCopies, mediaCopyPreferences} from '../../db/schema/mediaCopies'
import type {OriginalItem, OriginalTarget} from '../../../shared/originalOperations'
import {driveFileVersion, type SourceWriteAdapter} from '../mediaSources/adapter'
import {nasMediaPath} from '../../../shared/remoteMedia'
import {driveMediaPath} from '../../../shared/cloudDrive'
import {nasVersionMatches} from '../mediaSources/locations'
import {sourceError} from '../mediaSources/context'
import {hashCopy} from '../mediaSources/copies'
import {loadInheritedFolderTagsForMediaRows} from '../mediaInheritedFolderTags'
import {tagsInMedia} from '../../db/schema/tagsInMedia'
import {clearResolvedPathCache} from '../../../app/server/resolvePathCache'
import {resumableCopy} from './resumableCopy'

const mediaPath = (ref: OriginalTarget) => ref.connectionId === 'google-drive' ? driveMediaPath(ref.key)
  : ref.connectionId ? nasMediaPath(ref.connectionId, ref.key) : ref.key
const absent = (err: unknown) => ['ENOENT', 'not_found', 2].includes((err as {code: string}).code)
  || (err as {status: number}).status === 404

/** A transfer owns a durable upload sub-operation; linking and optional removal follow verification. */
export async function runOriginalTransfer(options: {
  db: ApiDb; item: OriginalItem; signal: AbortSignal; save: () => void; commit: () => void; guard: () => void
  open: (ref: OriginalTarget) => Promise<SourceWriteAdapter>
  spool: (item: OriginalItem) => string
  upload: (item: OriginalItem) => Promise<void>
  progress: (bytes: number) => void
}) {
  const {db, item, signal, save, guard, open, spool, upload, progress} = options
  const source = item.source!
  const using = async <T>(ref: OriginalTarget, action: (adapter: SourceWriteAdapter) => Promise<T>) => {
    guard(); signal.throwIfAborted()
    const adapter = await open(ref)
    try { return await action(adapter) } finally { adapter.close() }
  }
  const currentPath = () => db.drizzle.select().from(media).where(eq(media.id, item.mediaId!)).get()
  const assertCard = () => {
    guard(); signal.throwIfAborted()
    const card = currentPath()
    const expected = item.removeSource && ['linked', 'removed'].includes(item.phase)
      ? mediaPath(item.transfer!.destination!) : item.sourcePath
    if (!card || card.deletedAt || card.path !== expected) throw sourceError('card_changed')
  }
  const checked = (ref: OriginalTarget) => using(ref, adapter => hashCopy(adapter, ref.key, signal, assertCard))
  const verifySource = async () => {
    const result = await checked(source)
    if (result.file.version !== item.version || result.file.size !== item.total || result.sha256 !== item.digest) throw sourceError('source_changed')
    return result.file
  }
  assertCard()
  if (source.connectionId === item.target!.connectionId && source.key === item.target!.key) throw sourceError('invalid_path')
  if (item.phase === 'pending') {
    if (source.connectionId === 'google-drive') await using(source, async adapter => {
      const file = await adapter.drive!.getFileMeta(source.key, signal)
      if (file.mimeType.startsWith('application/vnd.google-apps.')) throw sourceError('invalid_file')
    })
    const original = await using(source, adapter => adapter.stat(source.key, signal))
    if (original.isDirectory || !original.version || !Number.isSafeInteger(original.size) || original.size < 0) throw sourceError('invalid_file')
    if (item.transfer) {
      if (original.version !== item.version || original.size !== item.total) throw sourceError('source_changed')
    } else {
      if (item.version && !nasVersionMatches(item.version, original.version)) throw sourceError('source_changed')
      item.version = original.version; item.total = original.size
    }
    if (!item.transfer) {
      item.transfer = {upload: {id: randomUUID(), kind: 'upload', target: {...item.target!}, conflict: item.conflict,
        uploadSize: item.total, state: 'pending', phase: 'pending', bytes: 0, total: item.total}}
      save()
    }
    const child = item.transfer.upload
    const filename = spool(child)
    fs.mkdirSync(path.dirname(filename), {recursive: true, mode: 0o700})
    if (item.removeSource) await using(source, async adapter => {
      if (!adapter.capabilities.delete) throw sourceError('read_only')
    })
    if (fs.existsSync(filename)) {
      // The rename may have committed immediately before the process stopped.
      const existing = await checked({key: filename})
      if (existing.file.size !== item.total || item.digest && existing.sha256 !== item.digest) throw sourceError('size_mismatch')
      item.digest = existing.sha256
    } else {
      const temporary = filename + '.part'
      const digest = await resumableCopy({item, source, destination: {key: temporary}, signal, open,
        guard: assertCard, save, progress, expectedVersion: item.version})
      if (item.digest && digest !== item.digest) throw sourceError('size_mismatch')
      item.digest = digest
      assertCard(); fs.renameSync(temporary, filename)
    }
    delete item.resume
    child.readyUpload = true; item.phase = 'prepared'; save()
  }
  const child = item.transfer!.upload
  if (item.phase === 'prepared') {
    await verifySource()
    await using(child.target!, async adapter => { if (!adapter.capabilities.move) throw sourceError('read_only') })
    child.conflict = item.conflict
    await upload(child)
    if (child.state === 'skipped') { item.state = 'skipped'; save(); fs.rmSync(spool(child), {force: true}); return }
    item.transfer!.destination = child.target!.connectionId === 'google-drive'
      ? {connectionId: 'google-drive', key: child.drive!.fileId!, name: child.drive!.name} : {...child.target!}
    item.phase = 'published'; save()
  }
  const destination = item.transfer!.destination!
  const verifyDestination = async () => {
    const result = await checked(destination)
    if (result.sha256 !== item.digest || result.file.size !== item.total
      || (item.transfer!.destinationVersion && item.transfer!.destinationVersion !== result.file.version)) throw sourceError('source_changed')
    return result.file
  }
  const published = await verifyDestination()
  if (item.phase === 'published') {
    const original = await verifySource()
    const inherited = item.removeSource ? await loadInheritedFolderTagsForMediaRows(db, [{id: item.mediaId!, path: item.sourcePath!}]) : []
    // Re-reading a large source can take minutes after the destination hash.
    // Do not register that hash if the destination changed in the meantime.
    const currentDestination = await using(destination, adapter => adapter.stat(destination.key, signal))
    if (currentDestination.isDirectory || currentDestination.version !== published.version
      || currentDestination.size !== published.size) throw sourceError('source_changed')
    assertCard()
    db.sqlite.transaction(() => {
      const retain = (ref: OriginalTarget, file: typeof published) => {
        const copyPath = mediaPath(ref)
        const previous = db.drizzle.select().from(verifiedMediaCopies)
          .where(and(eq(verifiedMediaCopies.mediaId, item.mediaId!), eq(verifiedMediaCopies.path, copyPath))).get()
        const values = {mediaId: item.mediaId!, path: copyPath, version: file.version, sha256: item.digest!, oshash: null,
          verificationMethod: 'sha256' as const, size: file.size, contentType: file.contentType,
          availability: 'available' as const, verifiedAt: new Date().toISOString()}
        const id = previous?.id || randomUUID()
        db.drizzle.insert(verifiedMediaCopies).values({id, ...values})
          .onConflictDoUpdate({target: [verifiedMediaCopies.mediaId, verifiedMediaCopies.path], set: values}).run()
        if (ref.connectionId) {
          const location = db.drizzle.select().from(mediaLocations).where(and(eq(mediaLocations.mediaId, item.mediaId!),
            eq(mediaLocations.connectionId, ref.connectionId), eq(mediaLocations.resourceKey, ref.key))).get()
          const value = {mediaId: item.mediaId!, connectionId: ref.connectionId, resourceKey: ref.key, version: file.version,
            availability: 'available' as const, lastVerifiedAt: values.verifiedAt}
          if (location) db.drizzle.update(mediaLocations).set(value).where(eq(mediaLocations.id, location.id)).run()
          else db.drizzle.insert(mediaLocations).values({id: randomUUID(), ...value}).run()
        }
        return id
      }
      const oldId = retain(source, original)
      const newId = retain(destination, published)
      if (item.removeSource) {
        const name = destination.name || published.name
        db.drizzle.update(media).set({path: mediaPath(destination), basename: name,
          ext: destination.connectionId ? path.extname(name).slice(1).toLowerCase() : path.extname(name)}).where(eq(media.id, item.mediaId!)).run()
        for (const tag of inherited) db.drizzle.insert(tagsInMedia).values(tag).onConflictDoNothing().run()
        db.drizzle.update(mediaCopyPreferences).set({copyId: newId}).where(and(eq(mediaCopyPreferences.mediaId, item.mediaId!), eq(mediaCopyPreferences.copyId, oldId))).run()
      }
      item.transfer!.destinationVersion = published.version
      // The link and its journal checkpoint commit together.
      item.phase = 'linked'; options.commit()
    })()
    clearResolvedPathCache()
    save()
  }
  if (item.removeSource && item.phase === 'linked') {
    await verifyDestination()
    await using(source, async adapter => {
      let original
      try { original = await adapter.stat(source.key, signal) } catch (err) { if (!absent(err)) throw err }
      if (original) {
        if (!adapter.capabilities.delete) throw sourceError('read_only')
        await verifySource(); await verifyDestination(); assertCard()
        if ((await adapter.stat(source.key, signal)).version !== item.version) throw sourceError('source_changed')
        if (source.connectionId === 'google-drive') {
          const file = await adapter.drive!.getFileMeta(source.key, signal)
          if (driveFileVersion(file) !== item.version) throw sourceError('source_changed')
          if (!adapter.drive?.originals) throw sourceError('read_only')
          await adapter.drive.originals.remove(source.key, file.etag, signal)
        } else {
          if (!adapter.remove) throw sourceError('read_only')
          await adapter.remove(source.key, signal)
        }
      }
    })
    assertCard()
    db.sqlite.transaction(() => {
      db.drizzle.update(verifiedMediaCopies).set({availability: 'unavailable'}).where(eq(verifiedMediaCopies.path, mediaPath(source))).run()
      if (source.connectionId) db.drizzle.update(mediaLocations).set({availability: 'unavailable'})
        .where(and(eq(mediaLocations.connectionId, source.connectionId), eq(mediaLocations.resourceKey, source.key))).run()
      item.phase = 'removed'; options.commit()
    })()
    save()
  }
  item.state = 'completed'; item.bytes = item.total; delete item.error; save()
  fs.rmSync(spool(child), {force: true})
}
