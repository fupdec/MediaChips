import type {ApiDb} from '../types/db'
import {
  OPUS_MT_MODELS,
  translateWithOpusMt,
  type OpusSourceLang,
} from './opusMtTranslate'

export type SemanticQueryLang = 'en' | OpusSourceLang

export type TranslateQueryResult = {
  query: string
  originalQuery: string
  translated: boolean
  sourceLang: SemanticQueryLang | null
  model: string | null
}

const CYRILLIC_RE = /[\u0400-\u04FF]/
const CJK_RE = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/
const SPANISH_MARKER_RE = /[ñÑ¿¡áéíóúüÁÉÍÓÚÜ]/
const LATIN_LETTER_RE = /[A-Za-zÀ-ÖØ-öø-ÿ]/
const NON_LATIN_LETTER_RE = /[^\u0000-\u007F\u00C0-\u024F\u1E00-\u1EFF\s\d\p{P}\p{S}]/u
const ENGLISH_WORD_HINT_RE = /\b(the|and|with|from|for|woman|man|girl|boy|car|beach|wearing|hat|person|people|walking|sitting|standing|red|blue|green|black|white)\b/i
const SPANISH_WORD_HINT_RE = /\b(el|la|los|las|un|una|de|del|que|con|para|por|mujer|hombre|niño|niña|playa|coche|sombrero|rojo|azul|persona|personas)\b/i

function hasCyrillic(text: string): boolean {
  return CYRILLIC_RE.test(text)
}

function hasCjk(text: string): boolean {
  return CJK_RE.test(text)
}

function hasSpanishMarkers(text: string): boolean {
  return SPANISH_MARKER_RE.test(text)
}

function hasLatinLetters(text: string): boolean {
  return LATIN_LETTER_RE.test(text)
}

function hasEnglishWordHints(text: string): boolean {
  return ENGLISH_WORD_HINT_RE.test(text)
}

function hasSpanishWordHints(text: string): boolean {
  return SPANISH_WORD_HINT_RE.test(text)
}

function looksEnglish(text: string): boolean {
  const normalized = String(text || '').trim()
  if (!normalized) return false
  if (hasCyrillic(normalized) || hasCjk(normalized) || hasSpanishMarkers(normalized)) {
    return false
  }
  if (!hasLatinLetters(normalized)) return false
  // Reject scripts outside Latin + common punctuation/digits.
  return !NON_LATIN_LETTER_RE.test(normalized)
}

function normalizeAppLocale(locale?: string | null): string {
  return String(locale || '').trim().toLowerCase()
}

/**
 * Detect whether a semantic query should be translated before CLIP embed.
 * Priority: script markers (ru/zh/es) → Spanish/English word hints → locale `es` → English.
 */
function detectSemanticQueryLang(
  text: string,
  appLocale?: string | null,
): SemanticQueryLang | null {
  const normalized = String(text || '').trim()
  if (!normalized) return null

  if (hasCyrillic(normalized)) return 'ru'
  if (hasCjk(normalized)) return 'zh'
  if (hasSpanishMarkers(normalized)) return 'es'

  if (hasLatinLetters(normalized)) {
    if (hasSpanishWordHints(normalized) && !hasEnglishWordHints(normalized)) return 'es'
    if (hasEnglishWordHints(normalized)) return 'en'

    const locale = normalizeAppLocale(appLocale)
    // Ambiguous Latin without markers/hints: prefer ES when the app locale is Spanish.
    if (locale === 'es') return 'es'
  }

  if (looksEnglish(normalized)) return 'en'
  return null
}

async function translateQueryToEnglish(
  db: ApiDb,
  text: string,
  options: {locale?: string | null} = {},
): Promise<TranslateQueryResult> {
  const originalQuery = String(text || '').trim()
  if (!originalQuery) {
    return {
      query: '',
      originalQuery: '',
      translated: false,
      sourceLang: null,
      model: null,
    }
  }

  const sourceLang = detectSemanticQueryLang(originalQuery, options.locale)
  if (!sourceLang || sourceLang === 'en') {
    return {
      query: originalQuery,
      originalQuery,
      translated: false,
      sourceLang: sourceLang === 'en' ? 'en' : null,
      model: null,
    }
  }

  try {
    const {text: translatedText, model} = await translateWithOpusMt(db, sourceLang, originalQuery)
    const query = translatedText.trim() || originalQuery
    const translated = query !== originalQuery
    return {
      query,
      originalQuery,
      translated,
      sourceLang,
      model: translated ? model : OPUS_MT_MODELS[sourceLang],
    }
  } catch {
    // Fall back to the original query so search still runs if Opus fails/downloads.
    return {
      query: originalQuery,
      originalQuery,
      translated: false,
      sourceLang,
      model: OPUS_MT_MODELS[sourceLang],
    }
  }
}

export {
  detectSemanticQueryLang,
  hasCjk,
  hasCyrillic,
  hasSpanishMarkers,
  looksEnglish,
  translateQueryToEnglish,
}
