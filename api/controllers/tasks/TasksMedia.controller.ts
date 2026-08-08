import type { TaskControllerShared, FfprobeInfo } from '../../types/tasks'
import type { AnyRecord } from '../../types/db'
import {
  HttpError,
  apiErrorMessage,
  sendAsClientError,
  sendControllerError,
  sendCreated,
  sendOk,
} from '../../types/errors'
import type { ApiRequest, ApiResponse } from '../../types/http'
import type { MediaPathFile } from '@shared/api/responses'
import { createMediaRepository } from '../../db/repositories/media'
import { createMediaTypesRepository } from '../../db/repositories/mediaTypes'
import { createMediaPostProcessor } from '../../services/mediaPostProcess'
import fs from 'fs'
import path from 'path'
import { stat } from 'fs/promises'
import {parseAudioId3Tags} from '../../services/audioId3Tags'
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
} from '../../services/mediaFingerprint'
import {
  normalizeMediaPath,
  pathsEquivalent,
  buildPathLookupVariants,
} from '../../utils/normalizeUserPath'
import { invalidateMediaDerivedCaches } from '../../services/mediaCacheInvalidation'
import { applyFolderTagsOnMediaAdd } from '../../services/applyFolderTagsOnMediaAdd'
import {
  buildBulkPathUpdatePatch,
  normalizeBulkPathUpdateInputs,
} from '../../services/mediaBulkPathUpdate'
import { ffprobe, resolveFfprobeDuration } from '../../utils/ffmpeg'
import { isUsableDuration } from '../../utils/ffprobeMath'
import { probeVideoMetadata } from '../../services/videoMetadataProbe'
import { isImageMediaType } from '../../utils/mediaType'

export default function createTasksMediaController(shared: TaskControllerShared) {
  const {
    db,
    dbPath,
    withTimeout,
    getParserSettings,
    getImageMedia,
    createThumbMiddle,
    createAudioThumb,
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

    const existing = mediaRepo.findByOshash(fingerprint.value, mediaType.id)

    if (!existing || pathsEquivalent(String(existing.path), pathToFile)) {
      return {fingerprint, duplicate: null}
    }

    return {
      fingerprint,
      duplicate: existing,
      parameter: 'oshash' as const,
    }
  }

  const addMediaToDb = async (
    rawPathToFile: string,
    mediaType: { id: unknown; type?: unknown },
    is_check_duplicates: boolean,
  ) => {
    const pathToFile = normalizeMediaPath(rawPathToFile)
    const { isVirtualZipPath, getZipEntryInfo } = await import('../../services/zipGallery')
    const virtualZip = isVirtualZipPath(pathToFile)

    let resolvedPath: string | null = null
    let filesize = 0
    let basename = ''
    let storedPath = pathToFile
    let ext = ''

    if (virtualZip) {
      const entryInfo = await getZipEntryInfo(pathToFile)
      if (!entryInfo) {
        throw new Error(`File not found: ${pathToFile}`)
      }
      filesize = entryInfo.filesize
      basename = entryInfo.basename
      ext = entryInfo.ext
      storedPath = pathToFile
      resolvedPath = entryInfo.zipPath
    } else {
      resolvedPath = await resolveExistingPath(pathToFile)

      if (!resolvedPath) {
        const dockerHint = process.env.MEDIA_CHIPS_DATA_DIR
          ? ' In Docker/NAS, mount the host folder and use the in-container path (for example /media/movies/...).'
          : ''
        throw new Error(`File not found: ${pathToFile}.${dockerHint}`)
      }

      const stats = await stat(resolvedPath)
      filesize = stats.size
      basename = path.basename(resolvedPath)
      storedPath = resolvedPath
      ext = path.extname(storedPath)
    }

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

        if (!virtualZip && resolvedPath) {
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
      }

      const defaults: AnyRecord = {
        filesize: filesize,
        ext,
        basename,
        name: path.parse(basename).name,
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

      if (!virtualZip && resolvedPath) {
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

  // ffprobe concurrency is enforced inside api/utils/ffmpeg.
  const getVideoMetadata = (pathToFile: string) => probeVideoMetadata(pathToFile)

  const getAudioMetadata = async (pathToFile: string) => {
    try {
      const info = await withTimeout(ffprobe(pathToFile), 60000, 'ffprobe') as FfprobeInfo
      const resolvedDuration = await withTimeout(
        resolveFfprobeDuration(pathToFile, info.format?.duration),
        60000,
        'ffprobe duration',
      )
      if (!isUsableDuration(resolvedDuration)) {
        throw new Error('duration less than 1 sec.')
      }

      const duration = Math.floor(resolvedDuration)

      let codec
      for (const stream of info.streams) {
        if (stream.codec_type !== 'audio') continue
        codec = stream.codec_name
        break
      }

      const id3 = parseAudioId3Tags(info.format?.tags as Record<string, unknown> | undefined)

      return {
        duration,
        bitrate: info.format.bit_rate,
        codec,
        title: id3.title,
        artist: id3.artist,
        album: id3.album,
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
    createAudioThumb,
    withTimeout,
  })

  const sendAddMediaResponse = (res: ApiResponse, result: AnyRecord) => {
    const {media, isCreated, duplicate} = result
    if (isCreated) {
      sendCreated(res, media)
      return
    }

    sendControllerError(
      res,
      new HttpError(202, 'Media already added.', {duplicate}),
      'Media already added.',
    )
  }

  const addMedia = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const pathToFile = req.body.path
      const mediaType = req.body.type
      const is_check_duplicates = req.body.is_check_duplicates

      const result = await addMediaToDb(pathToFile, mediaType, is_check_duplicates)

      if (result.isCreated && result.media) {
        await mediaPostProcess.processNewMedia(result.media, mediaType)
        try {
          await applyFolderTagsOnMediaAdd(db, result.media)
        } catch (folderTagError: unknown) {
          console.error(
            'Folder tag apply failed for new media:',
            apiErrorMessage(folderTagError),
          )
        }
      }

      sendAddMediaResponse(res, result)
    } catch (error) {
      console.error('addMedia failed:', error)
      sendAsClientError(res, error, 'Some error occurred while adding media.')
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

        const {isVirtualZipPath, getZipEntryInfo} = await import('../../services/zipGallery')
        if (!isVirtualZipPath(String(media.path || ''))) {
          const stats = fs.statSync(String(media.path))
          const filesize = stats.size
          mediaRepo.updateById(Number(media_id), {filesize})
        } else {
          const entryInfo = await getZipEntryInfo(String(media.path))
          if (entryInfo?.filesize != null) {
            mediaRepo.updateById(Number(media_id), {filesize: entryInfo.filesize})
          }
        }
      }

      sendOk(res, 'success')
    } catch (error) {
      sendAsClientError(res, error, 'Some error occurred while updating media info.')
    }
  }

  const ensureImageDimensions = async (req: ApiRequest, res: ApiResponse) => {
    const mediaId = Number(req.body.id)

    try {
      const media = mediaRepo.findById(mediaId)
      if (!media) {
        sendOk(res, {width: 0, height: 0})
        return
      }

      const mediaType = media.mediaTypeId
        ? mediaTypesRepo.findById(media.mediaTypeId)
        : undefined
      if (!isImageMediaType(mediaType)) {
        sendOk(res, {width: 0, height: 0})
        return
      }

      const dims = await mediaPostProcess.ensureImageDimensions(media)
      sendOk(res, dims || {width: 0, height: 0})
    } catch (error) {
      sendAsClientError(res, error, 'Some error occurred while reading image dimensions.')
    }
  }

  const searchMediaByPath = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = mediaRepo.searchByPathLike(String(req.body.query || ''))
      sendOk(res, data as unknown as MediaPathFile[])
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const updateMediaMultiple = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const mediaFiles = Array.isArray(req.body.mediaFiles) ? req.body.mediaFiles : []
      const updates = normalizeBulkPathUpdateInputs(mediaFiles)
      if (!updates.length) {
        sendOk(res)
        return
      }

      const existingById = new Map(
        mediaRepo.findByIds(updates.map((item) => item.id)).map((row) => [row.id, row]),
      )
      const patches = updates.map((item) => (
        buildBulkPathUpdatePatch(item, existingById.get(item.id))
      ))

      db.sqlite.transaction(() => {
        for (const patch of patches) {
          mediaRepo.updateById(patch.id, {
            path: patch.path,
            basename: patch.basename,
            name: patch.name,
            ext: patch.ext,
          })
        }
      })()

      invalidateMediaDerivedCaches()
      sendOk(res)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while updating media paths.')
    }
  }

  const getMostPopularWordsFromMedia = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const settings = await getParserSettings()
      const paths = mediaRepo.findPaths()

      const parsed = paths.map((path) => {
        const tokenized = tokenizeFilePath(String(path), {
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

      sendOk(res, parsed)
    } catch (err) {
      sendControllerError(res, err, "Some error occurred while performing query.")
    }
  }

  return {
    addMediaVideo,
    addMediaImage,
    addMediaAudio,
    addMediaText,
    addMedia,
    updateMediaInfo,
    ensureImageDimensions,
    searchMediaByPath,
    updateMediaMultiple,
    getMostPopularWordsFromMedia,
  }
}
