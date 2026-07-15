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
  fileExists,
  resolveExistingPath,
} from '../../services/contentHash'
import {
  buildMediaDuplicateKey,
  findRegisteredDuplicate,
  registerDuplicateMedia,
  withDuplicateLookupLock,
} from '../../services/addMediaDedup'
import {
  computeFingerprint,
  duplicateParameterForKind,
} from '../../services/mediaFingerprint'
import {
  runWithFfprobeLimit,
} from '../../services/mediaPostProcessQueue'
import {
  normalizeMediaPath,
  pathsEquivalent,
  buildPathLookupVariants,
} from '../../utils/normalizeUserPath'
import { mediaNameLooksLikePath, parseMediaFilePath } from '@shared/mediaPath'
import { invalidateMediaDerivedCaches } from '../../services/mediaCacheInvalidation'

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

  const buildDuplicateResponse = (
    existing: {id?: unknown; path?: unknown},
    pathToFile: string,
    parameter: 'path' | 'content_hash' | 'oshash' | 'basename_filesize',
    reason?: 'duplicate' | 'moved',
  ) => ({
    isCreated: false as const,
    duplicate: {
      parameter,
      path: existing.path,
      id: existing.id,
      ...(reason ? {reason, new_path: pathToFile} : {}),
    },
  })

  const findFastDuplicate = (
    basename: string,
    filesize: number,
    mediaType: {id: unknown},
    pathToFile: string,
  ) => {
    const duplicateKey = buildMediaDuplicateKey(mediaType.id, filesize, basename)
    const registeredDuplicate = findRegisteredDuplicate(duplicateKey)

    if (registeredDuplicate && !pathsEquivalent(registeredDuplicate.path, pathToFile)) {
      return {
        duplicate: registeredDuplicate,
        duplicateKey,
        parameter: 'basename_filesize' as const,
      }
    }

    const duplicateByBasename = mediaRepo.findByBasenameFilesizeAndMediaType(
      basename,
      filesize,
      mediaType.id,
    )

    if (duplicateByBasename && !pathsEquivalent(String(duplicateByBasename.path), pathToFile)) {
      return {
        duplicate: duplicateByBasename,
        duplicateKey,
        parameter: 'basename_filesize' as const,
      }
    }

    return null
  }

  const findFingerprintDuplicate = async (
    pathToFile: string,
    resolvedPath: string,
    filesize: number,
    mediaType: {id: unknown; type?: unknown},
  ) => {
    let fingerprint
    try {
      fingerprint = await computeFingerprint({
        path: resolvedPath,
        filesize,
        mediaType: mediaType.type != null ? String(mediaType.type) : undefined,
      })
    } catch (error: unknown) {
      console.error(`Fingerprint failed for ${pathToFile}:`, apiErrorMessage(error))
      return null
    }

    if (!fingerprint) return null

    const existing = fingerprint.kind === 'oshash'
      ? mediaRepo.findByOshash(fingerprint.value, mediaType.id)
      : mediaRepo.findByContentHash(fingerprint.value, mediaType.id)

    if (!existing || pathsEquivalent(String(existing.path), pathToFile)) {
      return {fingerprint, duplicate: null}
    }

    return {
      fingerprint,
      duplicate: existing,
      parameter: duplicateParameterForKind(fingerprint.kind),
    }
  }

  const addMediaToDb = async (
    rawPathToFile: string,
    mediaType: { id: unknown; type?: unknown },
    is_check_duplicates: boolean,
  ) => {
    const pathToFile = normalizeMediaPath(rawPathToFile)
    const resolvedPath = await resolveExistingPath(pathToFile)

    if (!resolvedPath) {
      throw new Error(`File not found: ${pathToFile}`)
    }

    const stats = await stat(resolvedPath)
    const filesize = stats.size
    const basename = path.basename(resolvedPath)
    const duplicateKey = buildMediaDuplicateKey(mediaType.id, filesize, basename)

    const mediaTypeRow = mediaType.type != null
      ? mediaType
      : (mediaTypesRepo.findById(Number(mediaType.id)) || mediaType)
    const mediaTypeName = mediaTypeRow.type != null ? String(mediaTypeRow.type) : undefined

    const processAdd = async () => {
      const existingByPath = await findMediaByPath(pathToFile)

      if (existingByPath) {
        return buildDuplicateResponse(existingByPath, pathToFile, 'path')
      }

      let computedFingerprint: Awaited<ReturnType<typeof computeFingerprint>> = null

      if (is_check_duplicates) {
        const fastDuplicate = findFastDuplicate(basename, filesize, mediaType, pathToFile)
        if (fastDuplicate) {
          const existingPathExists = await fileExists(String(fastDuplicate.duplicate.path))
          return buildDuplicateResponse(
            fastDuplicate.duplicate,
            pathToFile,
            fastDuplicate.parameter,
            existingPathExists ? 'duplicate' : 'moved',
          )
        }

        const fingerprintMatch = await findFingerprintDuplicate(
          pathToFile,
          resolvedPath,
          filesize,
          {id: mediaType.id, type: mediaTypeName},
        )
        computedFingerprint = fingerprintMatch?.fingerprint || null

        if (fingerprintMatch?.duplicate) {
          const existingPathExists = await fileExists(String(fingerprintMatch.duplicate.path))
          return buildDuplicateResponse(
            fingerprintMatch.duplicate,
            pathToFile,
            fingerprintMatch.parameter,
            existingPathExists ? 'duplicate' : 'moved',
          )
        }
      }

      const storedPath = resolvedPath

      const defaults: AnyRecord = {
        filesize: filesize,
        ext: path.extname(storedPath),
        basename,
        name: path.parse(storedPath).name,
        mediaTypeId: mediaType.id,
      }

      const {row: media, created: isCreated} = mediaRepo.findOrCreateByPath(storedPath, defaults)

      if (!isCreated) {
        return {
          media,
          ...buildDuplicateResponse(media, pathToFile, 'path'),
        }
      }

      if (is_check_duplicates) {
        registerDuplicateMedia(duplicateKey, {
          id: Number(media.id),
          path: String(media.path),
        })
      }

      try {
        const fingerprint = computedFingerprint || await computeFingerprint({
          path: resolvedPath,
          filesize,
          mediaType: mediaTypeName,
        })
        if (fingerprint) {
          mediaRepo.updateById(Number(media.id), fingerprint.patch)
        }
      } catch (error: unknown) {
        console.error(`Fingerprint failed for ${pathToFile}:`, apiErrorMessage(error))
      }

      return {
        media,
        isCreated: true,
        duplicate: false,
      }
    }

    if (!is_check_duplicates) {
      return processAdd()
    }

    return withDuplicateLookupLock(duplicateKey, processAdd)
  }

  const getVideoMetadata = async (pathToFile: string) => runWithFfprobeLimit(async () => {
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
  })

  const getAudioMetadata = async (pathToFile: string) => runWithFfprobeLimit(async () => {
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
  })

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

      if (result.isCreated && result.media) {
        await mediaPostProcess.processNewMedia(result.media, mediaType)
      }

      sendAddMediaResponse(res, result)
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
    try {
      const mediaFiles = Array.isArray(req.body.mediaFiles) ? req.body.mediaFiles : []

      for (const item of mediaFiles) {
        const id = Number(item.id)
        const filePath = String(item.path ?? '')
        if (!id || !filePath) continue

        const existing = mediaRepo.findById(id)
        const parsed = parseMediaFilePath(filePath)
        const oldStem = existing?.path ? parseMediaFilePath(existing.path).name : ''
        const stemUnchanged = Boolean(oldStem) && oldStem === parsed.name
        const existingName = existing?.name != null ? String(existing.name) : ''

        // Preserve custom display titles when only the directory changes.
        // Always repair names that were previously stored as full paths
        // (path-browserify bug on Windows bulk edits).
        const name = stemUnchanged
          && existingName
          && !mediaNameLooksLikePath(existingName)
          ? existingName
          : parsed.name

        mediaRepo.updateById(id, {
          path: filePath,
          basename: parsed.basename,
          name,
          ext: parsed.ext,
        })
      }

      invalidateMediaDerivedCaches()
      res.sendStatus(201)
    } catch (err: unknown) {
      res.status(500).send({
        message: apiErrorMessage(err) || 'Some error occurred while updating media paths.',
      })
    }
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
