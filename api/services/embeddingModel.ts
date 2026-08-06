import type { ApiDb } from '../types/db'
import {projectPath} from '../../shared/projectRoot'
import type {
  EmbeddingVector,
  FeatureExtractionModel,
  ModelStatus,
} from '../types/mlModels'
import fs from 'fs'
import path from 'path'
import {resolveProcessResourcesPath} from '../utils/resourcesPath'

const DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2'

let extractor: FeatureExtractionModel | null = null
let loadingPromise: Promise<FeatureExtractionModel> | null = null
let lastError: Error | null = null
const textEmbeddingCache = new Map<string, EmbeddingVector>()
const MAX_TEXT_EMBEDDING_CACHE_ENTRIES = 500

function rememberEmbedding(text: string, embedding: EmbeddingVector) {
  if (textEmbeddingCache.has(text)) {
    textEmbeddingCache.delete(text)
  }
  textEmbeddingCache.set(text, embedding)
  if (textEmbeddingCache.size <= MAX_TEXT_EMBEDDING_CACHE_ENTRIES) return
  const oldestKey = textEmbeddingCache.keys().next().value
  if (oldestKey !== undefined) textEmbeddingCache.delete(oldestKey)
}

function getModelsRoot(db: ApiDb) {
  const resourcesPath = resolveProcessResourcesPath()
  if (resourcesPath) {
    const bundled = path.join(resourcesPath, 'models')
    if (fs.existsSync(bundled)) return bundled
  }

  const base = db?.path_databases || process.app_folder || projectPath('app_storage')
  return path.join(base, 'models')
}

function getModelCacheDir(db: ApiDb) {
  return getModelsRoot(db)
}

function hasDownloadedModel(db: ApiDb) {
  const cacheDir = getModelCacheDir(db)
  if (!fs.existsSync(cacheDir)) return false

  const stack = [cacheDir]
  while (stack.length) {
    const dir = stack.pop()
    if (!dir) continue
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name)
      if (entry.isDirectory()) stack.push(entryPath)
      else if (/\.(onnx|json|txt)$/i.test(entry.name)) return true
    }
  }

  return false
}

async function loadModel(db: ApiDb): Promise<FeatureExtractionModel> {
  if (extractor) return extractor
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    const cacheDir = getModelCacheDir(db)
    fs.mkdirSync(cacheDir, { recursive: true })

    try {
      const transformers = require('@xenova/transformers')
      const { pipeline, env } = transformers

      env.cacheDir = cacheDir
      env.localModelPath = cacheDir
      env.allowRemoteModels = true
      env.allowLocalModels = true

      extractor = await pipeline('feature-extraction', DEFAULT_MODEL, {
        quantized: true,
      }) as FeatureExtractionModel
      lastError = null
      return extractor
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error))
      throw lastError
    } finally {
      loadingPromise = null
    }
  })()

  return loadingPromise
}

async function embedText(db: ApiDb, text: unknown): Promise<EmbeddingVector> {
  const normalized = String(text || '').trim().toLowerCase()
  if (textEmbeddingCache.has(normalized)) {
    const cached = textEmbeddingCache.get(normalized)!
    rememberEmbedding(normalized, cached)
    return cached
  }

  const model = await loadModel(db)
  const output = await model(normalized, {
    pooling: 'mean',
    normalize: true,
  })

  const embedding = Array.from(output.data)
  rememberEmbedding(normalized, embedding)
  return embedding
}

function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0

  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  if (!normA || !normB) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

function getStatus(db: ApiDb, useML: boolean): ModelStatus {
  if (!useML) return { status: 'disabled', model: DEFAULT_MODEL }
  if (extractor) return { status: 'loaded', model: DEFAULT_MODEL, path: getModelCacheDir(db) }
  if (loadingPromise) return { status: 'downloading', model: DEFAULT_MODEL, path: getModelCacheDir(db) }
  if (lastError) {
    return {
      status: 'error',
      model: DEFAULT_MODEL,
      path: getModelCacheDir(db),
      message: lastError.message,
    }
  }
  return {
    status: hasDownloadedModel(db) ? 'downloaded' : 'not_downloaded',
    model: DEFAULT_MODEL,
    path: getModelCacheDir(db),
  }
}

export {
  DEFAULT_MODEL,
  cosineSimilarity,
  embedText,
  getStatus,
  hasDownloadedModel,
  loadModel,
}
