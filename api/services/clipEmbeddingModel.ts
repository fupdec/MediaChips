import type {ApiDb} from '../types/db'
import type {ModelStatus} from '../types/mlModels'
import {projectPath} from '../../shared/projectRoot'
import {resolveProcessResourcesPath} from '../utils/resourcesPath'
import {
  l2Normalize,
  type ClipEmbeddingVector,
} from './clipEmbeddingMath'
import fs from 'fs'
import path from 'path'

export const CLIP_EMBEDDING_MODEL = 'Xenova/clip-vit-base-patch32'

type ClipTokenizer = {
  (texts: string[], options?: Record<string, unknown>): Record<string, unknown>
}

type ClipProcessor = {
  (image: unknown): Promise<Record<string, unknown>> | Record<string, unknown>
}

type ClipTextModel = {
  (inputs: Record<string, unknown>): Promise<{text_embeds: {data: ArrayLike<number>; dims: number[]}}>
}

type ClipVisionModel = {
  (inputs: Record<string, unknown>): Promise<{image_embeds: {data: ArrayLike<number>; dims: number[]}}>
}

type ClipRuntime = {
  tokenizer: ClipTokenizer
  textModel: ClipTextModel
  processor: ClipProcessor
  visionModel: ClipVisionModel
  RawImage: {read: (filePath: string) => Promise<unknown>}
}

let runtime: ClipRuntime | null = null
let loadingPromise: Promise<ClipRuntime> | null = null
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

function hasDownloadedClipModel(db: ApiDb) {
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

async function loadClipEmbeddingRuntime(db: ApiDb): Promise<ClipRuntime> {
  if (runtime) return runtime
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    const cacheDir = getWritableModelCacheDir(db)
    const bundledDir = getBundledModelsDir()
    fs.mkdirSync(cacheDir, {recursive: true})

    try {
      const {
        AutoTokenizer,
        CLIPTextModelWithProjection,
        AutoProcessor,
        CLIPVisionModelWithProjection,
        RawImage,
        env,
      } = require('@xenova/transformers')

      env.cacheDir = cacheDir
      env.localModelPath = bundledDir || cacheDir
      env.allowRemoteModels = true
      env.allowLocalModels = true

      const [tokenizer, textModel, processor, visionModel] = await Promise.all([
        AutoTokenizer.from_pretrained(CLIP_EMBEDDING_MODEL),
        CLIPTextModelWithProjection.from_pretrained(CLIP_EMBEDDING_MODEL, {quantized: true}),
        AutoProcessor.from_pretrained(CLIP_EMBEDDING_MODEL),
        CLIPVisionModelWithProjection.from_pretrained(CLIP_EMBEDDING_MODEL, {quantized: true}),
      ])

      runtime = {
        tokenizer,
        textModel,
        processor,
        visionModel,
        RawImage,
      }
      lastError = null
      return runtime
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error))
      throw lastError
    } finally {
      loadingPromise = null
    }
  })()

  return loadingPromise
}

function tensorToVector(data: ArrayLike<number>, dims: number[]): ClipEmbeddingVector {
  const flat = Array.from(data)
  if (dims.length === 2 && dims[0] === 1) {
    return l2Normalize(flat.slice(0, dims[1]))
  }
  return l2Normalize(flat)
}

async function embedClipText(db: ApiDb, text: string): Promise<ClipEmbeddingVector> {
  const normalized = String(text || '').trim()
  if (!normalized) return []

  const model = await loadClipEmbeddingRuntime(db)
  const inputs = model.tokenizer([normalized], {padding: true, truncation: true})
  const {text_embeds} = await model.textModel(inputs)
  return tensorToVector(text_embeds.data, text_embeds.dims)
}

async function embedClipImageFile(db: ApiDb, imagePath: string): Promise<ClipEmbeddingVector> {
  const filePath = String(imagePath || '')
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`CLIP image not found: ${filePath}`)
  }

  const model = await loadClipEmbeddingRuntime(db)
  const image = await model.RawImage.read(filePath)
  const inputs = await model.processor(image)
  const {image_embeds} = await model.visionModel(inputs)
  return tensorToVector(image_embeds.data, image_embeds.dims)
}

function getClipEmbeddingStatus(db: ApiDb, enabled = true): ModelStatus {
  if (!enabled) return {status: 'disabled', model: CLIP_EMBEDDING_MODEL}
  if (runtime) return {status: 'loaded', model: CLIP_EMBEDDING_MODEL, path: getModelCacheDir(db)}
  if (loadingPromise) return {status: 'loading', model: CLIP_EMBEDDING_MODEL, path: getModelCacheDir(db)}
  if (lastError) {
    return {
      status: 'error',
      model: CLIP_EMBEDDING_MODEL,
      path: getModelCacheDir(db),
      message: lastError.message,
    }
  }
  return {
    status: hasDownloadedClipModel(db) ? 'downloaded' : 'not_downloaded',
    model: CLIP_EMBEDDING_MODEL,
    path: getModelCacheDir(db),
  }
}

export {
  embedClipImageFile,
  embedClipText,
  getClipEmbeddingStatus,
  getModelCacheDir,
  hasDownloadedClipModel,
  loadClipEmbeddingRuntime,
}
