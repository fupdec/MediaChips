import type {ApiDb} from '../types/db'
import {getModelCacheDir} from './clipEmbeddingModel'
import fs from 'fs'
import path from 'path'

/** Source languages we can translate to English before CLIP embed. */
export type OpusSourceLang = 'ru' | 'zh' | 'es' | 'de' | 'fr' | 'ja' | 'pt'

export const OPUS_MT_MODELS: Record<OpusSourceLang, string> = {
  ru: 'Xenova/opus-mt-ru-en',
  zh: 'Xenova/opus-mt-zh-en',
  es: 'Xenova/opus-mt-es-en',
  de: 'Xenova/opus-mt-de-en',
  fr: 'Xenova/opus-mt-fr-en',
  ja: 'Xenova/opus-mt-ja-en',
  pt: 'Xenova/opus-mt-pt-en',
}

type TranslationPipeline = (text: string, options?: Record<string, unknown>) => Promise<
  Array<{translation_text?: string}> | {translation_text?: string}
>

const runtimes = new Map<OpusSourceLang, TranslationPipeline>()
const loadingPromises = new Map<OpusSourceLang, Promise<TranslationPipeline>>()
const lastErrors = new Map<OpusSourceLang, Error>()

function opusModelCacheToken(lang: OpusSourceLang): string {
  return OPUS_MT_MODELS[lang].replace(/^Xenova\//, '')
}

function hasDownloadedOpusModel(db: ApiDb, lang: OpusSourceLang): boolean {
  if (runtimes.has(lang)) return true
  const cacheDir = getModelCacheDir(db)
  if (!fs.existsSync(cacheDir)) return false
  const token = opusModelCacheToken(lang)
  const stack = [cacheDir]
  while (stack.length) {
    const dir = stack.pop()
    if (!dir) continue
    let entries
    try {
      entries = fs.readdirSync(dir, {withFileTypes: true})
    } catch {
      continue
    }
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        stack.push(entryPath)
      } else if (/\.(onnx|json)$/i.test(entry.name) && entryPath.includes(token)) {
        return true
      }
    }
  }
  return false
}

async function loadOpusMtRuntime(db: ApiDb, lang: OpusSourceLang): Promise<TranslationPipeline> {
  const existing = runtimes.get(lang)
  if (existing) return existing

  const pending = loadingPromises.get(lang)
  if (pending) return pending

  const promise = (async () => {
    const cacheDir = getModelCacheDir(db)
    fs.mkdirSync(cacheDir, {recursive: true})

    try {
      const {pipeline, env} = require('@xenova/transformers')
      env.cacheDir = cacheDir
      env.localModelPath = cacheDir
      env.allowRemoteModels = true
      env.allowLocalModels = true

      const translator = await pipeline('translation', OPUS_MT_MODELS[lang], {
        quantized: true,
      }) as TranslationPipeline

      runtimes.set(lang, translator)
      lastErrors.delete(lang)
      return translator
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error))
      lastErrors.set(lang, err)
      throw err
    } finally {
      loadingPromises.delete(lang)
    }
  })()

  loadingPromises.set(lang, promise)
  return promise
}

function extractTranslationText(
  output: Array<{translation_text?: string}> | {translation_text?: string},
): string {
  if (Array.isArray(output)) {
    return String(output[0]?.translation_text || '').trim()
  }
  return String(output?.translation_text || '').trim()
}

async function translateWithOpusMt(
  db: ApiDb,
  lang: OpusSourceLang,
  text: string,
): Promise<{text: string, model: string}> {
  const model = OPUS_MT_MODELS[lang]
  const translator = await loadOpusMtRuntime(db, lang)
  const output = await translator(text)
  const translated = extractTranslationText(output)
  return {
    text: translated || text,
    model,
  }
}

/** Warm a translation model in the background without blocking search. */
function prefetchOpusMtModel(db: ApiDb, lang: OpusSourceLang): void {
  if (runtimes.has(lang) || loadingPromises.has(lang)) return
  void loadOpusMtRuntime(db, lang).catch(() => {
    // Prefetch is best-effort; search can proceed without translation.
  })
}

function getOpusMtLastError(lang: OpusSourceLang): Error | null {
  return lastErrors.get(lang) || null
}

export {
  getOpusMtLastError,
  hasDownloadedOpusModel,
  loadOpusMtRuntime,
  prefetchOpusMtModel,
  translateWithOpusMt,
}
