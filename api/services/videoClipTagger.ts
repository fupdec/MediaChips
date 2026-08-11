import type { ApiDb } from '../types/db'
import {projectPath} from '../../shared/projectRoot'
import type { ClipClassifierModel, ModelStatus } from '../types/mlModels'
import type {
  ClipClassificationRow,
  ClipFrame,
  ClipPromptEntry,
  ClipTaggerOptions,
} from '../types/videoClipTagger'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { extractVideoFrame } from '../utils/ffmpeg'
import {
  getLocalizedLabel,
  getPromptEntries,
  tags as clipDictionaryTags,
} from './videoClipTagDictionary'
import {formatTimestamp} from './faceDetectorMath'
import {resolveProcessResourcesPath} from '../utils/resourcesPath'
import {createXenovaDownloadTracker} from './xenovaDownloadProgress'
import {
  estimateDownloadEtaSeconds,
  resolveDownloadPercent,
} from './downloadProgress'

const CLIP_MODEL = 'Xenova/clip-vit-base-patch32'
/** Approximate download size for progress / confirm copy. */
const CLIP_MODEL_SIZE_MB = 150

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

async function loadModel(
  db: ApiDb,
  options: {
    onProgress?: (progress: {loaded: number; total: number | null; percent: number}) => void
  } = {},
): Promise<ClipClassifierModel> {
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

      const tracker = createXenovaDownloadTracker(CLIP_MODEL_SIZE_MB * 1024 * 1024)
      classifier = await pipeline('zero-shot-image-classification', CLIP_MODEL, {
        quantized: true,
        progress_callback: (data: {status?: string; file?: string; loaded?: number; total?: number}) => {
          tracker.handle(data)
          options.onProgress?.(tracker.get())
        },
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

async function* prepareClipModel(
  db: ApiDb,
  options: {shouldStop?: () => boolean} = {},
) {
  const needsDownload = !hasDownloadedModel(db) && !classifier
  if (!needsDownload) {
    await loadModel(db)
    return
  }

  const expectedBytes = CLIP_MODEL_SIZE_MB * 1024 * 1024
  const startedAt = Date.now()
  const state = {
    loaded: 0,
    total: null as number | null,
    percent: 0,
    done: false,
    error: null as Error | null,
  }

  yield {
    type: 'status' as const,
    phase: 'downloading_clip',
    message: 'Downloading visual search (CLIP)…',
    percent: 0,
    loaded: 0,
    total: null,
    etaSeconds: null as number | null,
    sizeMb: CLIP_MODEL_SIZE_MB,
  }

  const promise = loadModel(db, {
    onProgress: (progress) => {
      state.loaded = progress.loaded
      state.total = progress.total
      state.percent = progress.percent
    },
  })
    .then(() => {
      state.done = true
    })
    .catch((error: unknown) => {
      state.error = error instanceof Error ? error : new Error(String(error))
      state.done = true
    })

  let lastPercent = -1
  while (!state.done) {
    if (options.shouldStop?.()) {
      // Cannot abort xenova mid-download cleanly; wait out and surface abort after.
      await promise.catch(() => undefined)
      throw new Error('aborted')
    }
    const percent = resolveDownloadPercent({
      loaded: state.loaded,
      total: state.total,
      expectedBytes,
    })
    const etaSeconds = estimateDownloadEtaSeconds({
      loaded: state.loaded,
      total: state.total,
      expectedBytes,
      elapsedMs: Date.now() - startedAt,
    })
    if (percent !== lastPercent) {
      lastPercent = percent
      yield {
        type: 'status' as const,
        phase: 'downloading_clip',
        message: percent > 0
          ? `Downloading visual search (CLIP)… ${percent}%`
          : 'Downloading visual search (CLIP)…',
        percent,
        loaded: state.loaded,
        total: state.total,
        etaSeconds,
        sizeMb: CLIP_MODEL_SIZE_MB,
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }

  if (state.error) throw state.error

  yield {
    type: 'status' as const,
    phase: 'clip_ready',
    message: 'Visual search (CLIP) model downloaded.',
    percent: 100,
    sizeMb: CLIP_MODEL_SIZE_MB,
  }
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

function createFrame(input: string, output: string, timestamp: string, width: number = 384) {
  return extractVideoFrame({
    input,
    output,
    timestamp,
    vf: `scale=${width}:-1`,
  })
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
  CLIP_MODEL_SIZE_MB,
  getStatus,
  hasDownloadedModel,
  labelFramesAtTimestamps,
  loadModel,
  prepareClipModel,
}
