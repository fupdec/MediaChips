import type {ApiDb} from '../types/db'
import {getModelCacheDir} from './clipEmbeddingModel'
import fs from 'fs'

export type OpusSourceLang = 'ru' | 'zh' | 'es'

export const OPUS_MT_MODELS: Record<OpusSourceLang, string> = {
  ru: 'Xenova/opus-mt-ru-en',
  zh: 'Xenova/opus-mt-zh-en',
  es: 'Xenova/opus-mt-es-en',
}

type TranslationPipeline = (text: string, options?: Record<string, unknown>) => Promise<
  Array<{translation_text?: string}> | {translation_text?: string}
>

const runtimes = new Map<OpusSourceLang, TranslationPipeline>()
const loadingPromises = new Map<OpusSourceLang, Promise<TranslationPipeline>>()
const lastErrors = new Map<OpusSourceLang, Error>()

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

function getOpusMtLastError(lang: OpusSourceLang): Error | null {
  return lastErrors.get(lang) || null
}

export {
  getOpusMtLastError,
  loadOpusMtRuntime,
  translateWithOpusMt,
}
