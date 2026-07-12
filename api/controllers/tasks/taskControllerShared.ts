import type { AnyRecord } from '../../types/db'
import type {
  EmbeddingModelService,
  ImageMediaService,
  VideoClipTaggerService,
  VideoImagesGenerationService,
} from '../../types/tasks'
import type { ApiRequest, ApiResponse } from '../../types/http'
import type { ApiDb } from '../../types/db'
import path from 'path'
import {
  extractVideoFrame,
  extractVideoThumbnail,
} from '../../utils/ffmpeg'
import { runWithFfmpegLimit } from '../../services/mediaPostProcessQueue'
import { createSettingsRepository } from '../../db/repositories/settings'
import {
  GENERATED_MEDIA_FOLDERS,
  type GeneratedMediaFolderKey,
} from '../../../shared/generatedMediaFolders'
import { VIDEO_THUMB_HEIGHT, VIDEO_THUMB_JPEG_QUALITY, VIDEO_MARK_HEIGHT, VIDEO_MARK_JPEG_QUALITY } from '../../../shared/videoPreview'

function lazyService<T = AnyRecord>(modulePath: string) {
  let cached: T | undefined
  return (): T => {
    if (!cached) cached = require(modulePath) as T
    return cached
  }
}

const getVideoClipTagger = lazyService<VideoClipTaggerService>('../../services/videoClipTagger')
const getEmbeddingModel = lazyService<EmbeddingModelService>('../../services/embeddingModel')
const getImageMedia = lazyService<ImageMediaService>('../../services/imageMedia')
const getVideoImagesGeneration = lazyService<VideoImagesGenerationService>('../../services/videoImagesGeneration')

const resolveGeneratedFolderPath = (dbPath: string, folderKey: string) => {
  const relativePath = GENERATED_MEDIA_FOLDERS[folderKey as GeneratedMediaFolderKey]
  if (!relativePath) return null
  return path.join(dbPath, relativePath)
}

export default function createTaskControllerShared(db: ApiDb) {
  const getDbPath = () => db.path!

  const withTimeout = (promise: Promise<unknown>, ms: number, label: string) => Promise.race([
    promise,
    new Promise((_ : unknown, reject: (reason?: unknown) => void) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    }),
  ])

  const createStreamAbortSignal = (req: ApiRequest, res: ApiResponse) => {
    let stopped = false
    const stop = () => {
      stopped = true
    }

    // Do not use req 'close': on Windows it fires once the POST body is read,
    // which cancels long-running stream tasks before any work starts.
    req.on('aborted', stop)
    res.on('close', () => {
      if (!res.writableFinished) {
        stop()
      }
    })

    return () => stopped
  }

  const parserSettingDefaults = {
    'pathParser.useML': true,
    'pathParser.similarityThreshold': 0.75,
    'pathParser.folderWeight': 1.5,
    'pathParser.clusterThreshold': 0.88,
    'pathParser.preferLongestMatch': true,
    'pathParser.matchPrecision': 0.5,
  }

  const parseBooleanSetting = (value: unknown) => {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value === 1
    return String(value).toLowerCase() === 'true'
  }

  const getParserSettings = async (overrides: AnyRecord = {}) => {
    const options = Object.keys(parserSettingDefaults)
    const rows = createSettingsRepository(db.drizzle).findByOptions(options)

    const settings: Record<string, boolean | number> = {...parserSettingDefaults}
    for (const row of rows) {
      const option = String(row.option)
      if (option === 'pathParser.useML') settings[option] = parseBooleanSetting(row.value)
      else if (option === 'pathParser.preferLongestMatch') settings[option] = parseBooleanSetting(row.value)
      else if (option === 'pathParser.matchPrecision') settings[option] = Number(row.value)
      else settings[option] = Number(row.value)
    }

    return {
      useML: parseBooleanSetting(overrides.useML ?? settings['pathParser.useML']),
      similarityThreshold: Number(overrides.similarityThreshold ?? settings['pathParser.similarityThreshold']),
      folderWeight: Number(overrides.folderWeight ?? settings['pathParser.folderWeight']),
      clusterThreshold: Number(overrides.clusterThreshold ?? settings['pathParser.clusterThreshold']),
      preferLongestMatch: parseBooleanSetting(
        overrides.preferLongestMatch ?? settings['pathParser.preferLongestMatch'],
      ),
      matchPrecision: Number(
        overrides.matchPrecision ?? settings['pathParser.matchPrecision'] ?? 0.5,
      ),
    }
  }

  const createThumbMiddle = (pathToFile: string, id: unknown) => runWithFfmpegLimit(() => {
    const outputPath = path.join(getDbPath(), 'media/videos/thumbs', `${id}.jpg`)
    return withTimeout(
      extractVideoThumbnail({
        input: pathToFile,
        outputPath,
        height: VIDEO_THUMB_HEIGHT,
        jpegQuality: VIDEO_THUMB_JPEG_QUALITY,
      }),
      120000,
      'ffmpeg thumbnail',
    ).then(() => 'success')
  })

  const createThumbCustom = (
    timestamp: unknown,
    inputPath: string,
    outputPath: string,
    height: number,
    jpegQuality?: number,
  ) => {
    return extractVideoFrame({
      input: inputPath,
      output: outputPath,
      timestamp: timestamp != null ? String(timestamp) : undefined,
      vf: `scale=-1:${height}`,
      jpegQuality,
    })
  }

  return {
    db,
    getDbPath,
    get dbPath() {
      return getDbPath()
    },
    withTimeout,
    createStreamAbortSignal,
    getParserSettings,
    getVideoClipTagger,
    getEmbeddingModel,
    getImageMedia,
    getVideoImagesGeneration,
    resolveGeneratedFolderPath: (folderKey: string) => resolveGeneratedFolderPath(getDbPath(), folderKey),
    createThumbMiddle,
    createThumbCustom,
  }
}
