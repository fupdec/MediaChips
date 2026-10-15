import path from 'path'
import {eq, inArray} from 'drizzle-orm'
import type {ApiDb} from '../../types/db'
import {media} from '../../db/schema/media'
import {createMediaRepository} from '../../db/repositories/media'
import {createMediaTypesRepository} from '../../db/repositories/mediaTypes'
import {createVideoMetadataRepository} from '../../db/repositories/videoMetadata'
import {driveMediaPath, driveMediaKind, parseDriveMediaPath, DriveFileIdSchema} from '../../../shared/cloudDrive'
import type {CloudDriveService} from './index'
import {createDriveSourceAdapter} from '../mediaSources/driveAdapter'
import {resolveMediaLocation, recordDriveLocation} from '../mediaSources/locations'
import {invalidateMediaDerivedCaches} from '../mediaCacheInvalidation'

export function driveLibraryFile(db: ApiDb, id: number) {
  const row = createMediaRepository(db.drizzle).findById(id)
  const fileId = row && !row.deletedAt ? parseDriveMediaPath(row.path) : null
  if (!row || !fileId) throw Object.assign(new Error('Google Drive media not found.'), {status: 404})
  const resolved = resolveMediaLocation(db, id)
  if (resolved.provider !== 'gdrive') throw Object.assign(new Error('Google Drive media not found.'), {status: 404})
  return {row, fileId: resolved.location.resourceKey}
}
export async function listDriveFolder(db: ApiDb, service: CloudDriveService, folderId: string, pageToken?: string) {
  const sqlite = db.sqlite
  if (!service.status().authenticated) throw Object.assign(new Error('Connect Google Drive first.'), {status: 409})
  const page = await createDriveSourceAdapter(service.transport).list(DriveFileIdSchema.parse(folderId), pageToken)
  const result = {folderId, nextPageToken: page.nextPageToken, mock: service.config.mock, files: page.entries.map(file => ({
    id: file.resourceKey, name: file.name, mimeType: file.contentType, size: file.size,
    modifiedTime: file.modifiedAt === undefined ? undefined : new Date(file.modifiedAt).toISOString(), isFolder: file.isDirectory,
  }))}
  if (db.sqlite !== sqlite) throw Object.assign(new Error('The active library changed.'), {status: 409})
  const paths = result.files.filter(file => !file.isFolder).map(file => driveMediaPath(file.id))
  const rows = paths.length ? db.drizzle.select({id: media.id, path: media.path, deletedAt: media.deletedAt}).from(media).where(inArray(media.path, paths)).all() : []
  const imported = new Map(rows.filter(row => !row.deletedAt).map(row => [row.path, row.id]))
  return {...result, files: result.files.map(file => ({...file, mediaId: imported.get(driveMediaPath(file.id)) ?? null}))}
}
export async function importDriveFile(db: ApiDb, service: CloudDriveService, fileId: string) {
  DriveFileIdSchema.parse(fileId)
  if (!service.status().authenticated) throw Object.assign(new Error('Connect Google Drive first.'), {status: 409})
  const sqlite = db.sqlite
  const file = await createDriveSourceAdapter(service.transport).stat(fileId)
  if (db.sqlite !== sqlite) throw Object.assign(new Error('The active library changed.'), {status: 409})
  const kind = driveMediaKind(file.name)
  if (!kind || !file.contentType.startsWith(`${kind}/`) || !Number.isSafeInteger(file.size) || file.size <= 0) {
    throw Object.assign(new Error('Select a supported non-empty video, audio or image file.'), {status: 415})
  }
  const type = createMediaTypesRepository(db.drizzle).findByType(kind)
  if (!type) throw Object.assign(new Error('This media type is unavailable in the library.'), {status: 400})
  const repo = createMediaRepository(db.drizzle)
  const mediaPath = driveMediaPath(fileId)
  const trashed = db.drizzle.select({id: media.id}).from(media).where(eq(media.trashOriginalPath, mediaPath)).get()
  if (trashed) throw Object.assign(new Error('Restore this file from Trash before importing it again.'), {status: 409})
  const previous = repo.findByPathVariants([mediaPath])
  if (previous?.deletedAt) throw Object.assign(new Error('Restore this file from Trash before importing it again.'), {status: 409})
  const result = db.drizzle.transaction(() => {
    const {row, created} = repo.findOrCreateByPath(mediaPath, {
      name: file.name, basename: file.name, ext: path.posix.extname(file.name).slice(1).toLowerCase(),
      filesize: file.size, mediaTypeId: type.id,
    })
    if (kind !== 'image') {
      const metadata = createVideoMetadataRepository(db.drizzle)
      if (!metadata.findByMediaId(row.id)) metadata.create({mediaId: row.id, duration: 0})
    }
    recordDriveLocation(db, row.id, fileId, file.version)
    return {id: row.id, title: row.name || file.name, created}
  })
  invalidateMediaDerivedCaches()
  return result
}
