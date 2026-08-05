import type {ApiDb} from '../types/db'
import {projectPath} from '../../shared/projectRoot'
import type {ModelStatus} from '../types/mlModels'
import fs from 'fs'
import path from 'path'
import http from 'http'
import https from 'https'
import {createSettingsRepository} from '../db/repositories/settings'
import {formatDocsForPrompt, searchDocs} from './docRetrieval'
import {normalizeAssistParsed} from './localAiAssist'
import {
  buildLocalAiSystemPrompt,
  extractDocIds,
  extractJsonObject,
  filterLocalAiChatHistory,
  mergeCitedLocalAiDocs,
  pickLastUserMessageContent,
  resolveLocalAiMaxTokens,
  resolveLocalAiModelStatus,
  resolveLocalAiPromptText,
  shouldRetrieveLocalAiDocs,
} from './localLlmChat'
import {parseBooleanSetting} from '../../shared/parseBooleanSetting'

export const LOCAL_AI_MODEL_ID = 'qwen25-1_5b-instruct'
export const LOCAL_AI_MODEL_FILENAME = 'qwen2.5-1.5b-instruct-q4_k_m.gguf'
export const LOCAL_AI_MODEL_URL =
  'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf'
export const LOCAL_AI_MODEL_SIZE_MB = 1066
export const LOCAL_AI_ENABLED_OPTION = 'localAi.enabled'

export type LocalAiChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type LocalAiChatMode = 'chat' | 'regex' | 'filter' | 'meta'

export type LocalAiChatRequest = {
  mode?: LocalAiChatMode
  locale?: string
  messages?: LocalAiChatMessage[]
  context?: Record<string, unknown>
  system?: string
}

export type LocalAiStreamEvent =
  | {type: 'status'; phase: string; message: string; percent?: number}
  | {type: 'token'; text: string}
  | {type: 'done'; text: string; docs?: Array<{id: string; title: string}>; parsed?: Record<string, unknown> | null}
  | {type: 'error'; message: string}
  | {type: 'aborted'}
  | {type: 'tool_call'; id: string; name: string; arguments: Record<string, unknown>; needsConfirmation: boolean}

type LlamaModule = typeof import('node-llama-cpp')

let llamaModule: LlamaModule | null = null
let llamaInstance: Awaited<ReturnType<LlamaModule['getLlama']>> | null = null
let loadedModel: Awaited<ReturnType<Awaited<ReturnType<LlamaModule['getLlama']>>['loadModel']>> | null = null
let loadedModelPath: string | null = null
let loadingPromise: Promise<void> | null = null
let lastError: Error | null = null
let downloadPromise: Promise<void> | null = null

function getWritableModelCacheDir(db: ApiDb) {
  const base = db?.path_databases || process.app_folder || projectPath('app_storage')
  return path.join(base, 'models', LOCAL_AI_MODEL_ID)
}

function getModelPath(db: ApiDb) {
  const cached = path.join(getWritableModelCacheDir(db), LOCAL_AI_MODEL_FILENAME)
  return fs.existsSync(cached) ? cached : null
}

function hasDownloadedModel(db: ApiDb) {
  return Boolean(getModelPath(db))
}

export function isLocalAiEnabled(db: ApiDb): boolean {
  const settingsRepo = createSettingsRepository(db.drizzle)
  const value = settingsRepo.findByOption(LOCAL_AI_ENABLED_OPTION)?.value
  return parseBooleanSetting(value, false)
}

export function setLocalAiEnabled(db: ApiDb, enabled: boolean) {
  const settingsRepo = createSettingsRepository(db.drizzle)
  settingsRepo.upsertByOption(LOCAL_AI_ENABLED_OPTION, enabled ? '1' : '0')
}

export function getLocalAiStatus(db: ApiDb): ModelStatus & {
  enabled: boolean
  sizeMb: number
  filename: string
} {
  const enabled = isLocalAiEnabled(db)
  if (!enabled) {
    lastError = null
  }
  return resolveLocalAiModelStatus({
    enabled,
    modelId: LOCAL_AI_MODEL_ID,
    path: getWritableModelCacheDir(db),
    sizeMb: LOCAL_AI_MODEL_SIZE_MB,
    filename: LOCAL_AI_MODEL_FILENAME,
    sessionLoaded: Boolean(loadedModel && loadedModelPath === getModelPath(db)),
    loading: Boolean(loadingPromise || downloadPromise),
    lastError,
    downloaded: hasDownloadedModel(db),
  })
}

function downloadFileWithProgress(
  url: string,
  destination: string,
  onProgress?: (loaded: number, total: number | null) => void,
  signal?: {aborted: boolean},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    const request = client.get(url, {
      headers: {
        'User-Agent': 'mediachips/1.0 (+https://github.com/fupdec/MediaChips)',
      },
    }, (response) => {
      if (signal?.aborted) {
        response.resume()
        reject(new Error('aborted'))
        return
      }

      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume()
        downloadFileWithProgress(response.headers.location, destination, onProgress, signal).then(resolve, reject)
        return
      }

      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`Failed to download local AI model (HTTP ${response.statusCode})`))
        return
      }

      const total = Number(response.headers['content-length'] || 0) || null
      let loaded = 0
      const tmpPath = `${destination}.download`
      const file = fs.createWriteStream(tmpPath)

      response.on('data', (chunk: Buffer) => {
        if (signal?.aborted) {
          request.destroy()
          file.destroy()
          try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
          reject(new Error('aborted'))
          return
        }
        loaded += chunk.length
        onProgress?.(loaded, total)
      })

      response.pipe(file)
      file.on('finish', () => {
        file.close(() => {
          try {
            fs.renameSync(tmpPath, destination)
            resolve()
          } catch (error) {
            reject(error)
          }
        })
      })
      file.on('error', (error) => {
        try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
        reject(error)
      })
    })

    request.on('error', reject)
  })
}

async function loadLlamaModule(): Promise<LlamaModule> {
  if (llamaModule) return llamaModule
  // tsc CJS rewrites `import()` → `require()`, which breaks ESM packages with top-level await.
  const dynamicImport = new Function('specifier', 'return import(specifier)') as (
    specifier: string,
  ) => Promise<LlamaModule>
  llamaModule = await dynamicImport('node-llama-cpp')
  return llamaModule
}

async function ensureModelLoaded(db: ApiDb): Promise<void> {
  const modelPath = getModelPath(db)
  if (!modelPath) {
    throw new Error('Local AI model is not downloaded')
  }
  if (loadedModel && loadedModelPath === modelPath) return
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    try {
      lastError = null
      const llamaCpp = await loadLlamaModule()
      if (!llamaInstance) {
        llamaInstance = await llamaCpp.getLlama()
      }
      if (loadedModel && loadedModelPath !== modelPath) {
        await loadedModel.dispose?.()
        loadedModel = null
        loadedModelPath = null
      }
      loadedModel = await llamaInstance.loadModel({modelPath})
      loadedModelPath = modelPath
      lastError = null
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error))
      loadedModel = null
      loadedModelPath = null
      throw lastError
    } finally {
      loadingPromise = null
    }
  })()

  return loadingPromise
}

export async function* iterateDownloadLocalAi(
  db: ApiDb,
  options: {shouldStop?: () => boolean} = {},
): AsyncGenerator<LocalAiStreamEvent> {
  if (!isLocalAiEnabled(db)) {
    yield {type: 'error', message: 'Local AI is disabled. Enable it in Settings first.'}
    return
  }

  if (hasDownloadedModel(db)) {
    yield {type: 'status', phase: 'ready', message: 'Model already downloaded.', percent: 100}
    try {
      await ensureModelLoaded(db)
      yield {type: 'done', text: '', parsed: {status: getLocalAiStatus(db)}}
    } catch (error: unknown) {
      yield {
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      }
    }
    return
  }

  if (downloadPromise) {
    yield {type: 'error', message: 'A download is already in progress.'}
    return
  }

  const cacheDir = getWritableModelCacheDir(db)
  fs.mkdirSync(cacheDir, {recursive: true})
  const destination = path.join(cacheDir, LOCAL_AI_MODEL_FILENAME)
  const signal = {aborted: false}
  const progressState: {loaded: number; total: number | null; done: boolean; error: Error | null} = {
    loaded: 0,
    total: null,
    done: false,
    error: null,
  }

  yield {
    type: 'status',
    phase: 'downloading',
    message: `Downloading Local AI model (~${LOCAL_AI_MODEL_SIZE_MB} MB)…`,
    percent: 0,
  }

  lastError = null
  downloadPromise = downloadFileWithProgress(
    LOCAL_AI_MODEL_URL,
    destination,
    (loaded, total) => {
      progressState.loaded = loaded
      progressState.total = total
    },
    signal,
  )
    .then(() => {
      progressState.done = true
    })
    .catch((error: unknown) => {
      progressState.error = error instanceof Error ? error : new Error(String(error))
      progressState.done = true
    })
    .finally(() => {
      downloadPromise = null
    })

  let lastPercent = -1
  while (!progressState.done) {
    if (options.shouldStop?.()) {
      signal.aborted = true
      yield {type: 'aborted'}
      return
    }
    const percent = progressState.total
      ? Math.min(99, Math.round((progressState.loaded / progressState.total) * 100))
      : Math.min(99, Math.round((progressState.loaded / (LOCAL_AI_MODEL_SIZE_MB * 1024 * 1024)) * 100))
    if (percent !== lastPercent) {
      lastPercent = percent
      yield {
        type: 'status',
        phase: 'downloading',
        message: `Downloading Local AI model… ${percent}%`,
        percent,
      }
    }
    await new Promise((r) => setTimeout(r, 400))
  }

  if (progressState.error) {
    if (progressState.error.message === 'aborted' || options.shouldStop?.()) {
      yield {type: 'aborted'}
      return
    }
    yield {type: 'error', message: progressState.error.message}
    return
  }

  if (!hasDownloadedModel(db)) {
    yield {type: 'error', message: 'Download finished but model file is missing.'}
    return
  }

  yield {type: 'status', phase: 'loading', message: 'Loading model into memory…', percent: 100}
  try {
    await ensureModelLoaded(db)
    yield {type: 'done', text: '', parsed: {status: getLocalAiStatus(db)}}
  } catch (error: unknown) {
    yield {
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

export function deleteLocalAiModel(db: ApiDb): {deleted: boolean; path: string} {
  const cacheDir = getWritableModelCacheDir(db)
  loadedModel = null
  loadedModelPath = null
  lastError = null

  if (!fs.existsSync(cacheDir)) {
    return {deleted: false, path: cacheDir}
  }

  fs.rmSync(cacheDir, {recursive: true, force: true})
  return {deleted: true, path: cacheDir}
}

export async function* iterateLocalAiChat(
  db: ApiDb,
  req: LocalAiChatRequest,
  options: {shouldStop?: () => boolean} = {},
): AsyncGenerator<LocalAiStreamEvent> {
  if (!isLocalAiEnabled(db)) {
    yield {type: 'error', message: 'Local AI is disabled. Enable it in Settings first.'}
    return
  }
  if (!hasDownloadedModel(db)) {
    yield {type: 'error', message: 'Local AI model is not downloaded.'}
    return
  }

  try {
    yield {type: 'status', phase: 'loading', message: 'Loading model…'}
    await ensureModelLoaded(db)
    if (!loadedModel || !llamaModule) {
      throw new Error('Model failed to load')
    }

    const locale = String(req.locale || 'en')
    const userText = pickLastUserMessageContent(req.messages)
    const docs = shouldRetrieveLocalAiDocs(req.mode)
      ? searchDocs(userText, locale, 4)
      : []
    const docsText = formatDocsForPrompt(docs)

    const systemPrompt = buildLocalAiSystemPrompt(req, docsText)
    const context = await loadedModel.createContext({contextSize: 4096})
    const sequence = context.getSequence()
    const session = new llamaModule.LlamaChatSession({
      contextSequence: sequence,
      systemPrompt,
    })

    const history = filterLocalAiChatHistory(req.messages)
    const prompt = resolveLocalAiPromptText({history, userText})

    type QueueItem = LocalAiStreamEvent | {type: '__end'} | {type: '__fail'; error: Error}
    const queue: QueueItem[] = []
    let notify: (() => void) | null = null
    const push = (item: QueueItem) => {
      queue.push(item)
      notify?.()
    }

    const abortController = new AbortController()
    let finalText = ''
    let genError: Error | null = null
    let genDone = false

    const generation = session.prompt(prompt, {
      maxTokens: resolveLocalAiMaxTokens(req.mode),
      signal: abortController.signal,
      stopOnAbortSignal: true,
      onTextChunk: (chunk: string) => {
        if (options.shouldStop?.()) {
          abortController.abort()
          return
        }
        push({type: 'token', text: chunk})
      },
    }).then((text) => {
      finalText = String(text || '')
      genDone = true
      push({type: '__end'})
    }).catch((error: unknown) => {
      genError = error instanceof Error ? error : new Error(String(error))
      genDone = true
      push({type: '__fail', error: genError})
    })

    let full = ''
    while (!genDone || queue.length) {
      if (options.shouldStop?.()) {
        abortController.abort()
        yield {type: 'aborted'}
        try { await context.dispose?.() } catch { /* ignore */ }
        return
      }
      if (!queue.length) {
        await new Promise<void>((resolve) => {
          notify = resolve
          setTimeout(resolve, 50)
        })
        notify = null
        continue
      }
      const item = queue.shift()!
      if (item.type === 'token') {
        full += item.text
        yield item
      } else if (item.type === '__fail') {
        throw item.error
      }
    }

    await generation
    if (genError) throw genError
    const text = full || finalText
    const rawParsed = req.mode && req.mode !== 'chat' ? extractJsonObject(text) : null
    const parsed = req.mode && req.mode !== 'chat'
      ? normalizeAssistParsed(req.mode, rawParsed, (req.context || {}) as Record<string, unknown>)
      : null
    const citedIds = extractDocIds(text)
    const uniqueDocs = mergeCitedLocalAiDocs(docs, citedIds)

    yield {
      type: 'done',
      text,
      docs: uniqueDocs,
      parsed,
    }

    try { await context.dispose?.() } catch { /* ignore */ }
  } catch (error: unknown) {
    if (options.shouldStop?.()) {
      yield {type: 'aborted'}
      return
    }
    lastError = error instanceof Error ? error : new Error(String(error))
    yield {type: 'error', message: lastError.message}
  }
}
