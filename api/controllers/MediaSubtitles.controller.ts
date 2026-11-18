import {z} from 'zod'
import type {ApiDb} from '../types/db'
import type {ApiRequest, ApiResponse} from '../types/http'
import {HttpError, sendControllerError, sendOk} from '../types/errors'
import {createMediaRepository} from '../db/repositories/media'
import {resolveExistingPath} from '../services/contentHash'
import {listSubtitleTracks, readSubtitleFile} from '../services/subtitles'
import {isRemoteMediaPath} from '../../shared/remoteMedia'

/** External subtitle files (.srt/.vtt) lying next to a local video. NAS, cloud and web media have none. */
export function createMediaSubtitlesController(db: ApiDb) {
  const repo = createMediaRepository(db.drizzle)

  const localVideoPath = async (req: ApiRequest): Promise<string | null> => {
    const id = z.coerce.number().int().positive().safeParse(req.params.id)
    if (!id.success) throw new HttpError(400, 'Invalid media id')
    const row = repo.findById(id.data)
    if (!row || row.deletedAt) throw new HttpError(404, 'Media not found')
    if (!row.path || isRemoteMediaPath(row.path)) return null
    return resolveExistingPath(row.path)
  }

  return {
    async list(req: ApiRequest, res: ApiResponse) {
      try {
        const videoPath = await localVideoPath(req)
        sendOk(res, {tracks: videoPath ? await listSubtitleTracks(videoPath) : []})
      } catch (error) {
        sendControllerError(res, error, 'Unable to list subtitles')
      }
    },
    async read(req: ApiRequest, res: ApiResponse) {
      try {
        const name = z.string().min(1).max(255).safeParse(req.params.name)
        if (!name.success) throw new HttpError(400, 'Invalid subtitle name')
        const videoPath = await localVideoPath(req)
        const file = videoPath ? await readSubtitleFile(videoPath, name.data) : null
        if (!file) throw new HttpError(404, 'Subtitle not found')
        sendOk(res, file)
      } catch (error) {
        sendControllerError(res, error, 'Unable to read subtitles')
      }
    },
  }
}
