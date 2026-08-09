import type { ApiDb } from '../types/db'
import {projectPath} from '../../shared/projectRoot'
import type { ClipClassifierModel, ModelStatus } from '../types/mlModels'
import type {
  ClipClassificationRow,
  ClipFrame,
  ClipPromptEntry,
  ClipTaggerBatchResult,
  ClipTaggerMediaItem,
  ClipTaggerOptions,
  ExtractFramesResult,
} from '../types/videoClipTagger'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { extractVideoFrame, ffprobe } from '../utils/ffmpeg'
import {
  getLocalizedLabel,
  getPromptEntries,
  tags as clipDictionaryTags,
} from './videoClipTagDictionary'
import {formatTimestamp} from './faceDetectorMath'
import { createTagsRepository } from '../db/repositories/tags'
import {getClipFrameTimestamps} from './videoClipFrameSample'
import {aggregateFrameResults} from './videoClipTagAggregate'
import {resolveProcessResourcesPath} from '../utils/resourcesPath'

const CLIP_MODEL = 'Xenova/clip-vit-base-patch32'

let classifier: ClipClassifierModel | null = null
let loadingPromise: Promise<ClipClassifierModel> | null = null
let lastError: Error | null = null

function getWritableModelCacheDir(db: ApiDb) {
  const base = db?.path_databases || process.app_folder || projectPath('app_storage')
  return path.join(base, 'models')
}

function getBundledModelsDir() {
  const resourcesPath = resolveProcessResourcesPath()
  if (resourcesPath) {
    const bundled = path.join(resourcesPath, 'models')
    if (fs.existsSync(bundled)) return bundled
  }

  const projectModels = projectPath('models')
  if (fs.existsSync(projectModels)) return projectModels

  return null
}

function getModelCacheDir(db: ApiDb) {
  return getWritableModelCacheDir(db)
}

function hasDownloadedModel(db: ApiDb) {
  const cacheDir = getModelCacheDir(db)
  if (!fs.existsSync(cacheDir)) return false

  const stack = [cacheDir]
  while (stack.length) {
    const dir = stack.pop()
    if (!dir) continue
    const entries = fs.readdirSync(dir, {withFileTypes: true})
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name)
      if (entry.isDirectory()) stack.push(entryPath)
      else if (/\.(onnx|json|txt)$/i.test(entry.name) && entryPath.includes('clip-vit-base-patch32')) {
        return true
      }
    }
  }

  return false
}

async function loadModel(db: ApiDb): Promise<ClipClassifierModel> {
  if (classifier) return classifier
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    const cacheDir = getWritableModelCacheDir(db)
    const bundledDir = getBundledModelsDir()
    fs.mkdirSync(cacheDir, {recursive: true})

    try {
      const {pipeline, env} = require('@xenova/transformers')

      env.cacheDir = cacheDir
      env.localModelPath = bundledDir || cacheDir
      env.allowRemoteModels = true
      env.allowLocalModels = true

      classifier = await pipeline('zero-shot-image-classification', CLIP_MODEL, {
        quantized: true,
      }) as ClipClassifierModel
      lastError = null
      return classifier
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error))
      throw lastError
    } finally {
      loadingPromise = null
    }
  })()

  return loadingPromise
}

function getStatus(db: ApiDb, enabled: boolean = true): ModelStatus {
  if (!enabled) return {status: 'disabled', model: CLIP_MODEL}
  if (classifier) return {status: 'loaded', model: CLIP_MODEL, path: getModelCacheDir(db)}
  if (loadingPromise) return {status: 'loading', model: CLIP_MODEL, path: getModelCacheDir(db)}
  if (lastError) {
    return {
      status: 'error',
      model: CLIP_MODEL,
      path: getModelCacheDir(db),
      message: lastError.message,
    }
  }

  return {
    status: hasDownloadedModel(db) ? 'downloaded' : 'not_downloaded',
    model: CLIP_MODEL,
    path: getModelCacheDir(db),
  }
}

async function getVideoDuration(filePath: string) {
  const info = await ffprobe(filePath)
  const duration = Number(info?.format?.duration || 0)
  if (!duration) {
    throw new Error('Video duration is unavailable.')
  }
  return duration
}

function createFrame(input: string, output: string, timestamp: string, width: number = 384) {
  return extractVideoFrame({
    input,
    output,
    timestamp,
    vf: `scale=${width}:-1`,
  })
}

async function extractFrames(
  media: ClipTaggerMediaItem[],
  options: ClipTaggerOptions = {},
): Promise<ExtractFramesResult> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediachips-clip-tags-'))
  const frames: ClipFrame[] = []
  const frameWidth = Number(options.frameWidth || 384)
  const framesPerVideo = Number(options.framesPerVideo || 4)

  for (const item of media) {
    if (!item?.path || !fs.existsSync(item.path)) continue

    let duration: number
    try {
      duration = await getVideoDuration(String(item.path))
    } catch {
      continue
    }

    const timestamps = getClipFrameTimestamps(duration, framesPerVideo)
    for (let index = 0; index < timestamps.length; index++) {
      const output = path.join(tmpDir, `${item.id ?? index}_${index}.jpg`)
      try {
        await createFrame(String(item.path), output, timestamps[index], frameWidth)
        frames.push({
          framePath: output,
          mediaId: item.id,
          mediaPath: String(item.path),
          timestamp: timestamps[index],
        })
      } catch {
        // Broken frames should not block suggestions for the rest of the import.
      }
    }
  }

  return {tmpDir, frames}
}

async function extractFramesForMedia(
  item: ClipTaggerMediaItem,
  options: ClipTaggerOptions = {},
): Promise<ExtractFramesResult> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediachips-clip-tags-'))
  const frames: ClipFrame[] = []
  const frameWidth = Number(options.frameWidth || 384)
  const framesPerVideo = Number(options.framesPerVideo || 4)

  if (!item?.path || !fs.existsSync(item.path)) return {tmpDir, frames}

  let duration: number
  try {
    duration = await getVideoDuration(String(item.path))
  } catch {
    return {tmpDir, frames}
  }

  const timestamps = getClipFrameTimestamps(duration, framesPerVideo)
  for (let index = 0; index < timestamps.length; index++) {
    const output = path.join(tmpDir, `${item.id || 'media'}_${index}.jpg`)
    try {
      await createFrame(String(item.path), output, timestamps[index], frameWidth)
      frames.push({
        framePath: output,
        mediaId: item.id,
        mediaPath: String(item.path),
        timestamp: timestamps[index],
      })
    } catch {
      // Broken frames should not block suggestions for the rest of the import.
    }
  }

  return {tmpDir, frames}
}

async function classifyFrame(
  model: ClipClassifierModel,
  frame: ClipFrame,
  promptEntries: ClipPromptEntry[],
  options: ClipTaggerOptions = {},
): Promise<ClipClassificationRow[]> {
  const topK = Number(options.topK || 8)
  const minScore = Number(options.minScore || 0.15)
  const promptToKey = new Map(promptEntries.map((entry) => [entry.prompt, entry.key]))
  const output = await model(frame.framePath, promptEntries.map((entry) => entry.prompt))
  const rows = Array.isArray(output) ? output : []
  const bestByKey = new Map<string, ClipClassificationRow>()

  for (const row of rows) {
    const key = promptToKey.get(row.label)
    if (!key) continue

    const current = bestByKey.get(key)
    if (!current || row.score > current.score) {
      bestByKey.set(key, {
        key,
        score: row.score,
        prompt: row.label,
        mediaId: frame.mediaId,
        mediaPath: frame.mediaPath,
        timestamp: frame.timestamp,
      })
    }
  }

  return [...bestByKey.values()]
    .sort((a, b) => b.score - a.score)
    .filter(row => row.score >= minScore)
    .slice(0, topK)
}

function cleanup(tmpDir: string | null) {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, {recursive: true, force: true})
  }
}

async function suggestTagsFromVideoFrames(
  db: ApiDb,
  media: ClipTaggerMediaItem[],
  options: ClipTaggerOptions = {},
): Promise<ClipTaggerBatchResult> {
  let tmpDir: string | null = null

  try {
    const extracted = await extractFrames(media, options)
    tmpDir = extracted.tmpDir

    if (!extracted.frames.length) {
      return {
        suggestions: [],
        frames: 0,
        media: media.length,
        model: CLIP_MODEL,
      }
    }

    const model = await loadModel(db)
    const promptEntries = getPromptEntries() as ClipPromptEntry[]
    const frameResults: ClipClassificationRow[][] = []

    for (const frame of extracted.frames) {
      frameResults.push(await classifyFrame(model, frame, promptEntries, options))
    }

    const existingTags = options.excludeExisting === false
      ? []
      : ((options.tags || createTagsRepository(db.drizzle, db.sqlite).findAllNames()) as Array<{ name?: string }>)

    const suggestions = aggregateFrameResults(frameResults, options.locale || 'en', existingTags)
      .slice(0, Number(options.limit || 50))

    return {
      suggestions,
      frames: extracted.frames.length,
      media: media.length,
      model: CLIP_MODEL,
    }
  } finally {
    cleanup(tmpDir)
  }
}

async function classifyMedia(
  db: ApiDb,
  item: ClipTaggerMediaItem,
  options: ClipTaggerOptions = {},
): Promise<ClipTaggerBatchResult> {
  let tmpDir: string | null = null

  try {
    const extracted = await extractFramesForMedia(item, options)
    tmpDir = extracted.tmpDir

    if (!extracted.frames.length) {
      return {
        suggestions: [],
        frames: 0,
        media: item ? 1 : 0,
        model: CLIP_MODEL,
      }
    }

    const model = await loadModel(db)
    const promptEntries = getPromptEntries() as ClipPromptEntry[]
    const frameResults: ClipClassificationRow[][] = []

    for (const frame of extracted.frames) {
      frameResults.push(await classifyFrame(model, frame, promptEntries, options))
    }

    const existingTags = options.excludeExisting === false
      ? []
      : ((options.tags || createTagsRepository(db.drizzle, db.sqlite).findAllNames()) as Array<{ name?: string }>)

    const suggestions = aggregateFrameResults(frameResults, options.locale || 'en', existingTags)
      .slice(0, Number(options.limit || 50))

    return {
      suggestions,
      frames: extracted.frames.length,
      media: item ? 1 : 0,
      model: CLIP_MODEL,
    }
  } finally {
    cleanup(tmpDir)
  }
}

/**
 * Label chapter cut times with CLIP zero-shot tags from a frame inside each chapter.
 * Returns null entries when a frame fails; returns null overall when the model is unavailable.
 */
async function labelFramesAtTimestamps(
  db: ApiDb,
  videoPath: string,
  timesSec: number[],
  options: {
    locale?: string
    shouldStop?: () => boolean
    minScore?: number
    onProgress?: (fraction: number) => void
  } = {},
): Promise<Array<{label: string; score: number} | null> | null> {
  const times = (timesSec || [])
    .map((t) => Number(t))
    .filter((t) => Number.isFinite(t) && t >= 0)
  if (!times.length) return []
  if (!hasDownloadedModel(db) && !classifier) return null

  let tmpDir: string | null = null
  try {
    const model = await loadModel(db)
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediachips-chapter-labels-'))
    const promptEntries = getPromptEntries() as ClipPromptEntry[]
    const locale = options.locale || 'en'
    const minScore = Number(options.minScore) || 0.18
    const tagByKey = new Map(
      (clipDictionaryTags as Array<{key: string}>).map((tag) => [tag.key, tag]),
    )
    const results: Array<{label: string; score: number} | null> = []

    for (let index = 0; index < times.length; index++) {
      if (options.shouldStop?.()) break
      options.onProgress?.(index / Math.max(times.length, 1))

      const start = times[index]
      const next = times[index + 1]
      const sampleAt = next != null && next > start
        ? Math.min(start + 1.5, (start + next) / 2)
        : start + 1.5
      const output = path.join(tmpDir, `ch_${index}.jpg`)

      try {
        await createFrame(String(videoPath), output, formatTimestamp(sampleAt), 320)
        const rows = await classifyFrame(
          model,
          {
            framePath: output,
            mediaId: undefined,
            mediaPath: String(videoPath),
            timestamp: formatTimestamp(sampleAt),
          },
          promptEntries,
          {topK: 2, minScore},
        )
        if (!rows.length) {
          results.push(null)
          continue
        }

        const primaryTag = tagByKey.get(rows[0].key)
        const primary = primaryTag
          ? getLocalizedLabel(primaryTag, locale)
          : rows[0].key
        let label = primary
        if (rows[1] && rows[1].score >= Math.max(minScore, 0.22)) {
          const secondaryTag = tagByKey.get(rows[1].key)
          const secondary = secondaryTag
            ? getLocalizedLabel(secondaryTag, locale)
            : rows[1].key
          if (secondary && secondary !== primary) label = `${primary}, ${secondary}`
        }
        results.push({label: String(label || '').trim().slice(0, 60), score: rows[0].score})
      } catch {
        results.push(null)
      }
    }

    options.onProgress?.(1)
    return results.length === times.length ? results : null
  } catch {
    return null
  } finally {
    cleanup(tmpDir)
  }
}

export {
  CLIP_MODEL,
  aggregateFrameResults,
  classifyMedia,
  getStatus,
  hasDownloadedModel,
  labelFramesAtTimestamps,
  loadModel,
  suggestTagsFromVideoFrames,
}
