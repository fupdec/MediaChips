import type { AnyRecord } from '../../types/db'
import type {
  EmbeddingModelService,
  ImageMediaService,
  VideoClipTaggerService,
  VideoImagesGenerationService,
} from '../../types/tasks'
import type { ApiDb } from '../../types/db'
import path from 'path'
import {
  extractVideoFrame,
  extractVideoThumbnail,
} from '../../utils/ffmpeg'
import { createSettingsRepository } from '../../db/repositories/settings'
import {
  GENERATED_MEDIA_FOLDERS,
  type GeneratedMediaFolderKey,
} from '../../../shared/generatedMediaFolders'
import { VIDEO_THUMB_HEIGHT, VIDEO_THUMB_JPEG_QUALITY, VIDEO_MARK_HEIGHT, VIDEO_MARK_JPEG_QUALITY } from '../../../shared/videoPreview'
import {parseBooleanSetting} from '../../utils/parseBooleanSetting'
import { createStreamAbortSignal } from './ndjsonStreamRunner'

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

  const parserSettingDefaults = {
    'pathParser.useML': true,
    'pathParser.similarityThreshold': 0.75,
    'pathParser.folderWeight': 1.5,
    'pathParser.clusterThreshold': 0.88,
    'pathParser.preferLongestMatch': true,
    'pathParser.matchPrecision': 0.5,
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

  const createThumbMiddle = (pathToFile: string, id: unknown, seekRatio = 0.5) => {
    const outputPath = path.join(getDbPath(), 'media/videos/thumbs', `${id}.jpg`)
    const normalizedSeekRatio = Number.isFinite(seekRatio)
      ? Math.min(Math.max(Number(seekRatio), 0), 1)
      : 0.5
    // ffmpeg/ffprobe concurrency is enforced inside api/utils/ffmpeg.
    return withTimeout(
      extractVideoThumbnail({
        input: pathToFile,
        outputPath,
        height: VIDEO_THUMB_HEIGHT,
        jpegQuality: VIDEO_THUMB_JPEG_QUALITY,
        seekRatio: normalizedSeekRatio,
      }),
      120000,
      'ffmpeg thumbnail',
    ).then(() => 'success')
  }

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
