import type {ApiDb} from '../types/db'
import {
  OPUS_MT_MODELS,
  hasDownloadedOpusModel,
  prefetchOpusMtModel,
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
const HIRAGANA_KATAKANA_RE = /[\u3040-\u30FF]/
const HAN_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/
const SPANISH_MARKER_RE = /[ñÑ¿¡]/
const PORTUGUESE_MARKER_RE = /[ãõÃÕ]/
const GERMAN_MARKER_RE = /[ßäöüÄÖÜ]/
const FRENCH_MARKER_RE = /[àâæçèéêëîïôœùûüÿÀÂÆÇÈÉÊËÎÏÔŒÙÛÜŸ]/
const LATIN_LETTER_RE = /[A-Za-zÀ-ÖØ-öø-ÿ]/
const NON_LATIN_LETTER_RE = /[^\u0000-\u007F\u00C0-\u024F\u1E00-\u1EFF\s\d\p{P}\p{S}]/u

const ENGLISH_WORD_HINT_RE = /\b(the|and|with|from|for|woman|man|girl|boy|car|beach|wearing|hat|person|people|walking|sitting|standing|red|blue|green|black|white)\b/i
const SPANISH_WORD_HINT_RE = /\b(mujer|hombre|niño|niña|playa|coche|sombrero|rojo|azul|los|las|dónde|también)\b/i
const GERMAN_WORD_HINT_RE = /\b(der|die|das|und|mit|frau|mann|mädchen|junge|auto|strand|trägt|geht|sitzt|steht|grün|schwarz|weiß|eine|einer|einem|auf|am|im)\b/i
const FRENCH_WORD_HINT_RE = /\b(femme|homme|fille|garçon|voiture|plage|portant|personne|personnes|marche|assis|debout|rouge|bleu|vert|noir|blanc|dans|pour|sur|les|des|une)\b/i
const PORTUGUESE_WORD_HINT_RE = /\b(mulher|homem|menino|menina|praia|carro|chapéu|pessoa|pessoas|vermelho|não|uma|dos|das|pelo|pela)\b/i

/** App UI locales that map to a translation source language. */
const LOCALE_TO_SOURCE: Record<string, OpusSourceLang> = {
  cn: 'zh',
  de: 'de',
  es: 'es',
  fr: 'fr',
  ja: 'ja',
  pt: 'pt',
  ru: 'ru',
}

function hasCyrillic(text: string): boolean {
  return CYRILLIC_RE.test(text)
}

function hasHiraganaKatakana(text: string): boolean {
  return HIRAGANA_KATAKANA_RE.test(text)
}

function hasHan(text: string): boolean {
  return HAN_RE.test(text)
}

function hasCjk(text: string): boolean {
  return hasHiraganaKatakana(text) || hasHan(text)
}

function hasSpanishMarkers(text: string): boolean {
  return SPANISH_MARKER_RE.test(text)
}

function hasPortugueseMarkers(text: string): boolean {
  return PORTUGUESE_MARKER_RE.test(text)
}

function hasGermanMarkers(text: string): boolean {
  return GERMAN_MARKER_RE.test(text)
}

function hasFrenchMarkers(text: string): boolean {
  return FRENCH_MARKER_RE.test(text)
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

function hasGermanWordHints(text: string): boolean {
  return GERMAN_WORD_HINT_RE.test(text)
}

function hasFrenchWordHints(text: string): boolean {
  return FRENCH_WORD_HINT_RE.test(text)
}

function hasPortugueseWordHints(text: string): boolean {
  return PORTUGUESE_WORD_HINT_RE.test(text)
}

function looksEnglish(text: string): boolean {
  const normalized = String(text || '').trim()
  if (!normalized) return false
  if (hasCyrillic(normalized) || hasCjk(normalized)) return false
  if (hasSpanishMarkers(normalized) || hasPortugueseMarkers(normalized)) return false
  if (hasGermanMarkers(normalized) || hasFrenchMarkers(normalized)) return false
  if (!hasLatinLetters(normalized)) return false
  return !NON_LATIN_LETTER_RE.test(normalized)
}

function normalizeAppLocale(locale?: string | null): string {
  return String(locale || '').trim().toLowerCase()
}

function localeSourceLang(locale?: string | null): OpusSourceLang | null {
  return LOCALE_TO_SOURCE[normalizeAppLocale(locale)] || null
}

function detectLatinSourceLang(
  text: string,
  appLocale?: string | null,
): SemanticQueryLang | null {
  if (hasSpanishMarkers(text)) return 'es'
  if (hasPortugueseMarkers(text)) return 'pt'
  // ß is uniquely German among our languages.
  if (/[ß]/.test(text)) return 'de'

  const hints: OpusSourceLang[] = []
  if (hasSpanishWordHints(text)) hints.push('es')
  if (hasPortugueseWordHints(text)) hints.push('pt')
  if (hasGermanWordHints(text)) hints.push('de')
  if (hasFrenchWordHints(text)) hints.push('fr')
  if (hasGermanMarkers(text) && !hints.includes('de')) hints.push('de')
  if (hasFrenchMarkers(text) && !hints.includes('fr')) hints.push('fr')

  const uniqueHints = [...new Set(hints)]
  if (hasEnglishWordHints(text)) {
    // Clear English signal wins over weak Romance/Germanic overlap.
    if (uniqueHints.length === 0) return 'en'
    // Mixed EN + other: prefer English so we do not mistranslate English queries.
    return 'en'
  }

  if (uniqueHints.length === 1) return uniqueHints[0]

  const fromLocale = localeSourceLang(appLocale)
  if (fromLocale && ['de', 'es', 'fr', 'pt'].includes(fromLocale)) {
    if (uniqueHints.length === 0 || uniqueHints.includes(fromLocale)) {
      return fromLocale
    }
  }

  if (uniqueHints.length > 1) {
    // Ambiguous Romance/Germanic without locale: prefer first matched script/hint order above.
    return uniqueHints[0]
  }

  if (looksEnglish(text)) return 'en'
  return null
}

/**
 * Detect whether a semantic query should be translated before CLIP embed.
 * Covers all app UI languages: cn, de, es, fr, ja, pt, ru (+ en skip).
 */
function detectSemanticQueryLang(
  text: string,
  appLocale?: string | null,
): SemanticQueryLang | null {
  const normalized = String(text || '').trim()
  if (!normalized) return null

  if (hasCyrillic(normalized)) return 'ru'

  if (hasHiraganaKatakana(normalized)) return 'ja'
  if (hasHan(normalized)) {
    return normalizeAppLocale(appLocale) === 'ja' ? 'ja' : 'zh'
  }

  if (hasLatinLetters(normalized)) {
    return detectLatinSourceLang(normalized, appLocale)
  }

  const fromLocale = localeSourceLang(appLocale)
  if (fromLocale) return fromLocale

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
    // Avoid blocking semantic search on a first-time multi‑100MB Opus download.
    if (!hasDownloadedOpusModel(db, sourceLang)) {
      prefetchOpusMtModel(db, sourceLang)
      return {
        query: originalQuery,
        originalQuery,
        translated: false,
        sourceLang,
        model: OPUS_MT_MODELS[sourceLang],
      }
    }

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
