import {nasThumbnailSnapshot} from '../nas/mediaAssetsState'
import type {ApiDb} from '../../types/db'
import type {CloudMediaMetadata} from './mediaMetadata'
import type {SourceObject} from '../mediaSources/adapter'
import {createMediaRepository} from '../../db/repositories/media'
import {createVideoMetadataRepository} from '../../db/repositories/videoMetadata'
import {createImageMetadataRepository} from '../../db/repositories/imageMetadata'

const positive = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0

/** Fill gaps only: user edits, playback position and known technical fields are retained. */
export function fillCloudMediaMetadata(db: Pick<ApiDb, 'drizzle'>, mediaId: number, kind: string, file: Pick<SourceObject, 'size' | 'mediaMetadata'>): boolean {
  if (!['video', 'audio', 'image'].includes(kind)) return false
  const image = kind === 'image'
  const videos = createVideoMetadataRepository(db.drizzle)
  const images = createImageMetadataRepository(db.drizzle)
  const current = image ? images.findByMediaId(mediaId) : videos.findByMediaId(mediaId)
  const patch: CloudMediaMetadata = {}
  const fields = image ? ['width', 'height'] as const
    : kind === 'audio' ? ['duration', 'bitrate', 'codec', 'title', 'artist', 'album'] as const
      : ['duration', 'width', 'height', 'bitrate', 'fps', 'codec'] as const
  for (const key of fields) {
    const value = file.mediaMetadata?.[key]
    const previous = (current as Record<string, unknown> | undefined)?.[key]
    if (['codec', 'title', 'artist', 'album'].includes(key)) {
      if ((typeof previous !== 'string' || !previous.trim()) && typeof value === 'string' && value.trim()) {
        Object.assign(patch, {[key]: value.trim().slice(0, 1000)})
      }
    } else if (!positive(previous) && positive(value)) {
      Object.assign(patch, {[key]: value})
    }
  }
  const hasPatch = Object.keys(patch).length > 0
  if (image) {
    if (hasPatch) images.upsert({mediaId, ...current, ...patch})
  } else if (!current || hasPatch) videos.updateByMediaId(mediaId, patch)
  const mediaRepo = createMediaRepository(db.drizzle)
  const card = mediaRepo.findById(mediaId)
  const fillSize = card && !positive(card.filesize) && Number.isSafeInteger(file.size) && file.size > 0
  if (fillSize) mediaRepo.updateById(mediaId, {filesize: file.size})
  return hasPatch || !!fillSize
}

export function readCloudMediaMetadata(db: ApiDb, mediaId: number) {
  const card = createMediaRepository(db.drizzle).findById(mediaId)
  if (!card || card.deletedAt) return null
  const video = createVideoMetadataRepository(db.drizzle).findByMediaId(mediaId)
  const image = createImageMetadataRepository(db.drizzle).findByMediaId(mediaId)
  return {...nasThumbnailSnapshot(db, mediaId), id: mediaId, path: card.path, filesize: card.filesize || 0,
    width: image?.width || video?.width || 0, height: image?.height || video?.height || 0,
    duration: video?.duration || 0, bitrate: video?.bitrate || 0, fps: video?.fps || 0,
    title: video?.title || null, artist: video?.artist || null, album: video?.album || null,
    codec: video?.codec || null, ...(image ? {orientation: image.orientation || 1} : {}),
  }
}
