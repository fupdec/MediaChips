import fs from 'fs'
import path from 'path'
import type {ApiDb} from '../../types/db'
import {createMediaRepository} from '../../db/repositories/media'
import {isNasMediaPath} from '../../../shared/remoteMedia'

export type NasAssetsState = {source: string; version: string; retryAt: number; thumbnail: 'ready' | 'unavailable' | 'pending'}
export const nasAssetsStatePath = (dbPath: string, id: number) => path.join(dbPath, 'media/nas-assets', `${id}.json`)
export function readNasAssetsState(dbPath: string, id: number, source: string, version?: string): NasAssetsState | undefined {
  try {
    const state = JSON.parse(fs.readFileSync(nasAssetsStatePath(dbPath, id), 'utf8')) as NasAssetsState
    return state.source === source && (version === undefined || state.version === version) && Number.isFinite(state.retryAt) && ['ready', 'unavailable', 'pending'].includes(state.thumbnail) ? state : undefined
  } catch { return undefined }
}
export function nasThumbnailPath(dbPath: string, kind: string, id: number) {
  return path.join(dbPath, 'media', kind === 'image' ? 'images' : kind === 'audio' ? 'audios' : 'videos', 'thumbs', `${id}.jpg`)
}
export function nasThumbnailVersion(file: string): number | undefined {
  try {
    const info = fs.statSync(file)
    if (!info.isFile() || info.size < 128) return undefined
    const descriptor = fs.openSync(file, 'r')
    try {
      const header = Buffer.alloc(2)
      if (fs.readSync(descriptor, header, 0, 2, 0) !== 2 || header[0] !== 0xff || header[1] !== 0xd8) return undefined
    } finally { fs.closeSync(descriptor) }
    return Math.max(1, Math.floor(info.mtimeMs))
  } catch { return undefined }
}
export function nasThumbnailSnapshot(db: ApiDb, id: number) {
  const card = createMediaRepository(db.drizzle).findById(id)
  if (!db.path || !card || !isNasMediaPath(card.path)) return {}
  const type = db.sqlite.prepare('SELECT type FROM mediaTypes WHERE id = ?').get(card.mediaTypeId) as {type: string} | undefined
  const version = nasThumbnailVersion(nasThumbnailPath(db.path, type?.type || 'video', id))
  if (version) return {thumbnailState: 'ready' as const, thumbnailVersion: version}
  const state = readNasAssetsState(db.path, id, card.path)
  return {thumbnailState: state?.thumbnail === 'unavailable' ? 'unavailable' as const : 'pending' as const}
}
