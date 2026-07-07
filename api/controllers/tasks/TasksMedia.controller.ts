import type { TaskControllerShared, FfprobeInfo } from '../../types/tasks'
import type { AnyRecord } from '../../types/db'
import { apiErrorMessage } from '../../types/errors'
import type { ApiRequest, ApiResponse } from '../../types/http'
import type { MediaPathFile } from '@shared/api/responses'
import { createMediaRepository } from '../../db/repositories/media'
import { createMediaTypesRepository } from '../../db/repositories/mediaTypes'
import { createMediaPostProcessor } from '../../services/mediaPostProcess'
import fs from 'fs'
import path from 'path'
import { stat } from 'fs/promises'
import { ffprobe } from '../../utils/ffmpeg'
import { tokenizeFilePath } from '../../services/pathTokenizer'
import {
  computeContentHashForPath,
  fileExists,
  verifyContentHashMatch,
  resolveExistingPath,
} from '../../services/contentHash'
import {
  normalizeMediaPath,
  pathsEquivalent,
  buildPathLookupVariants,
} from '../../utils/normalizeUserPath'

export default function createTasksMediaController(shared: TaskControllerShared) {
  const {
    db,
    dbPath,
    withTimeout,
    getParserSettings,
    getImageMedia,
    createThumbMiddle,
  } = shared

  const mediaRepo = createMediaRepository(db.drizzle)
  const mediaTypesRepo = createMediaTypesRepository(db.drizzle)

  const findMediaByPath = async (pathToFile: string) => {
    const variants = buildPathLookupVariants(pathToFile)

    if (!variants.length) return null

    return mediaRepo.findByPathVariants(variants) ?? null
  }

  const addMediaToDb = async (
    rawPathToFile: string,
    mediaType: { id: unknown },
    is_check_duplicates: boolean,
  ) => {
    const pathToFile = normalizeMediaPath(rawPathToFile)
    const resolvedPath = await resolveExistingPath(pathToFile)

    if (!resolvedPath) {
      throw new Error(`File not found: ${pathToFile}`)
    }

    const stats = await stat(resolvedPath)
    const filesize = stats.size;

    const existingByPath = await findMediaByPath(pathToFile)

    if (existingByPath) {
      return {
        isCreated: false,
        duplicate: {
          parameter: 'path',
          path: existingByPath.path,
          id: existingByPath.id,
        },
      }
    }

    let contentHash = null
    try {
      contentHash = await computeContentHashForPath(resolvedPath)
    } catch (error) {
      console.error(`Content hash failed for ${pathToFile}:`, apiErrorMessage(error))
    }

    if (is_check_duplicates && contentHash) {
      let duplicate_by_hash = mediaRepo.findByContentHash(contentHash)

      if (!duplicate_by_hash) {
        const legacyCandidates = mediaRepo.findLegacyHashCandidates(filesize, mediaType.id)

        for (const candidate of legacyCandidates) {
          if (!(await fileExists(candidate.path))) {
            continue
          }

          try {
            const candidateHash = await computeContentHashForPath(candidate.path)
            mediaRepo.updateById(Number(candidate.id), {contentHash: candidateHash})

            if (candidateHash === contentHash) {
              duplicate_by_hash = {...candidate, contentHash: candidateHash}
              break
            }
          } catch (error) {
            console.error(`Content hash failed for ${candidate.path}:`, apiErrorMessage(error))
          }
        }
      }

      if (duplicate_by_hash && pathsEquivalent(duplicate_by_hash.path, pathToFile)) {
        return {
          isCreated: false,
          duplicate: {
            parameter: 'path',
            path: duplicate_by_hash.path,
            id: duplicate_by_hash.id,
          },
        }
      }

      if (duplicate_by_hash && await fileExists(duplicate_by_hash.path)) {
        const isSameContent = await verifyContentHashMatch(duplicate_by_hash.path, contentHash)

        if (!isSameContent) {
          try {
            const correctedHash = await computeContentHashForPath(duplicate_by_hash.path)
            mediaRepo.updateById(Number(duplicate_by_hash.id), {contentHash: correctedHash})
          } catch (error) {
            console.error(`Content hash correction failed for ${duplicate_by_hash.path}:`, apiErrorMessage(error))
          }

          duplicate_by_hash = undefined
        }
      }

      if (duplicate_by_hash) {
        const existingPathExists = await fileExists(duplicate_by_hash.path)

        return {
          isCreated: false,
          duplicate: {
            parameter: 'content_hash',
            path: duplicate_by_hash.path,
            id: duplicate_by_hash.id,
            reason: existingPathExists ? 'duplicate' : 'moved',
            new_path: pathToFile,
          },
        }
      }
    }

    const storedPath = resolvedPath

    const defaults: AnyRecord = {
      filesize: filesize,
      ext: path.extname(storedPath),
      basename: path.basename(storedPath),
      name: path.parse(storedPath).name,
      mediaTypeId: mediaType.id,
    }

    if (contentHash) {
      defaults.contentHash = contentHash
    }

    const {row: media, created: isCreated} = mediaRepo.findOrCreateByPath(storedPath, defaults)

    if (!isCreated) {
      return {
        media,
        isCreated: false,
        duplicate: {
          parameter: 'path',
          path: media.path,
          id: media.id,
        },
      }
    }

    return {
      media,
      isCreated: true,
      duplicate: false,
    }
  }

  const getVideoMetadata = async (pathToFile: string) => {
    try {
      const info = await withTimeout(ffprobe(pathToFile), 60000, 'ffprobe') as FfprobeInfo
      if (info.format.duration < 1) {
        throw new Error('duration less than 1 sec.')
      }

      const duration = Math.floor(info.format.duration)

      let width, height, codec, fps
      for (const stream of info.streams) {
        if (stream.codec_type !== 'video') continue
        width = stream.width
        height = stream.height
        codec = stream.codec_name
        fps = Math.ceil((stream.nb_frames ?? 0) / info.format.duration)
        break
      }

      return {
        duration: duration,
        bitrate: info.format.bit_rate,
        width,
        height,
        codec,
        fps,
      }
    } catch (error) {
      console.error(error)
      return false
    }
  }

  const getAudioMetadata = async (pathToFile: string) => {
    try {
      const info = await withTimeout(ffprobe(pathToFile), 60000, 'ffprobe') as FfprobeInfo
      if (!info?.format?.duration || info.format.duration < 1) {
        throw new Error('duration less than 1 sec.')
      }

      const duration = Math.floor(info.format.duration)

      let codec
      for (const stream of info.streams) {
        if (stream.codec_type !== 'audio') continue
        codec = stream.codec_name
        break
      }

      return {
        duration,
        bitrate: info.format.bit_rate,
        codec,
      }
    } catch (error) {
      console.error(error)
      return false
    }
  }

  const mediaPostProcess = createMediaPostProcessor({
    db,
    dbPath,
    getVideoMetadata,
    getAudioMetadata,
    getImageMedia: getImageMedia as unknown as import('../../types/mediaPostProcess').MediaPostProcessorDeps['getImageMedia'],
    createThumbMiddle,
    withTimeout,
  })

  const sendAddMediaResponse = (res: ApiResponse, result: AnyRecord) => {
    const {media, isCreated, duplicate} = result
    if (isCreated) {
      res.status(201).send(media)
      return
    }

    res.status(202).send({
      message: 'Media already added.',
      duplicate,
    })
  }

  const addMedia = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const pathToFile = req.body.path
      const mediaType = req.body.type
      const is_check_duplicates = req.body.is_check_duplicates

      const result = await addMediaToDb(pathToFile, mediaType, is_check_duplicates)

      sendAddMediaResponse(res, result)

      if (result.isCreated && result.media) {
        void mediaPostProcess.processNewMedia(result.media, mediaType).catch((error: unknown) => {
          console.error('Post-processing failed:', apiErrorMessage(error))
        })
      }
    } catch (error) {
      console.error('addMedia failed:', error)
      res.status(400).send({
        message: apiErrorMessage(error) || String(error),
      })
    }
  }

  const addMediaVideo = addMedia
  const addMediaImage = addMedia
  const addMediaAudio = addMedia
  const addMediaText = addMedia

  const updateMediaInfo = async (req: ApiRequest, res: ApiResponse) => {
    const media_id = req.body.id

    try {
      const media = mediaRepo.findById(Number(media_id))

      if (media) {
        const mediaType = media.mediaTypeId
          ? mediaTypesRepo.findById(media.mediaTypeId)
          : undefined

        await mediaPostProcess.refreshMediaInfo(media, mediaType)

        const stats = fs.statSync(String(media.path))
        const filesize = stats.size

        mediaRepo.updateById(Number(media_id), {filesize})
      }

      res.status(201).send('success')
    } catch (error) {
      res.status(400).send({message: apiErrorMessage(error)})
    }
  }

  const searchMediaByPath = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = mediaRepo.searchByPathLike(String(req.body.query || ''))
      res.status(201).send(data as unknown as MediaPathFile[])
    } catch (err: unknown) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while performing query."
      })
    }
  }

  const updateMediaMultiple = async function (req: ApiRequest, res: ApiResponse) {
    const mediaFiles = req.body.mediaFiles;
    for (const item of mediaFiles) {
      mediaRepo.updateById(Number(item.id), item)
    }
    res.sendStatus(201);
  }

  const getMostPopularWordsFromMedia = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const settings = await getParserSettings()
      const data = mediaRepo.findAllRaw()

      const parsed = data.map((i: AnyRecord) => {
        const tokenized = tokenizeFilePath(String(i.path), {
          folderWeight: settings.folderWeight,
        })
        return {
          folders: tokenized.tokens
            .filter((token) => token.source === 'folder')
            .map((token) => token.token),
          file: tokenized.tokens
            .filter((token) => token.source === 'file')
            .map((token) => token.token)
            .join(' '),
          tokens: tokenized.tokens,
        }
      })

      res.status(201).send(parsed)
    } catch (err) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while performing query."
      })
    }
  }

  return {
    addMediaVideo,
    addMediaImage,
    addMediaAudio,
    addMediaText,
    addMedia,
    updateMediaInfo,
    searchMediaByPath,
    updateMediaMultiple,
    getMostPopularWordsFromMedia,
  }
}
