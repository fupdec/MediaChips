import type { PathToken, TokenizeOptions, TokenizeResult } from '../types/pathTokenizer'
import path from 'path'
import {PATH_STOP_WORDS} from '../../shared/pathParser/stopWords'
import {
  PATH_NOISE_PATTERNS_TOKENIZER,
  matchesPathNoise,
} from '../../shared/pathParser/noisePatterns'

const NOISE_PATTERNS = PATH_NOISE_PATTERNS_TOKENIZER

/**
 * Organizational / descriptive tokens that never belong in tag suggestions.
 * These are added on top of PATH_STOP_WORDS (English stop words) and are
 * specific to the tag-suggestion tokenizer, so pathParser tag matching is
 * unaffected.
 */
const SUGGESTION_STOP_WORDS = new Set([
  // Site / domain fragments
  'com', 'www', 'http', 'https', 'zip', 'net', 'org', 'site',
  // Organization folders
  'pron', 'unsorted', 'torrents', 'torrent', 'best', 'downloads', 'downloaded',
  'download', 'movies', 'movie', 'videos', 'video', 'photo', 'photos', 'pic',
  'pics', 'picture', 'pictures', 'image', 'images', 'free', 'full', 'new',
  'pack', 'all', 'unknown',
  // Descriptive words that do not form meaningful tags
  'only', 'fans',
  // Adult/descriptive noise that pollutes performer tags
  'porn', 'cam', 'webcam', 'whores', 'whore', 'fart',
  // Language/site prefixes that should not join across folders
  'rus', 'de', 'von', 're', 'la',
  // Codecs / containers / misc
  'dvd', 'qtgmc', 'vts',
])

/** Matches alpha-numeric scene/season/code fragments like `s01`, `ma9504`, `dvd5`. */
const ALNUM_CODE_PATTERN = /^[a-zа-яё]{1,3}\d{1,6}$/

function normalizeToken(value: unknown) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/giu, '')
}

function splitSegment(segment: unknown) {
  const base = String(segment || '')
    .replace(/([a-zа-яё])([A-ZА-ЯЁ])/g, '$1 $2')
    .replace(/([A-ZА-ЯЁ]+)([A-ZА-ЯЁ][a-zа-яё])/g, '$1 $2')
    .replace(/[_\-.()[\]{}]+/g, ' ')

  return base.split(/\s+/).filter(Boolean)
}

function isNoiseToken(token: string, options: TokenizeOptions = {}) {
  const minLength = options.minLength || 3
  if (!token || token.length < minLength) return true
  if (/^\d+$/.test(token)) return true
  if (PATH_STOP_WORDS.has(token)) return true
  if (SUGGESTION_STOP_WORDS.has(token)) return true
  if (ALNUM_CODE_PATTERN.test(token)) return true
  return matchesPathNoise(token, NOISE_PATTERNS)
}

function tokenizeSegment(segment: unknown, options: TokenizeOptions = {}) {
  return splitSegment(segment)
    .map(normalizeToken)
    .filter(token => !isNoiseToken(token, options))
}

function tokenizeFilePath(filePath: string, options: TokenizeOptions = {}): TokenizeResult {
  const parsed = path.parse(String(filePath || ''))

  // Normalize ZIP virtual paths so the archive name becomes a folder segment
  // and the internal entry name becomes the file, without leaking "zip" tokens.
  // `/media/album.zip!/nested/photo.jpg` → `/media/album/nested/photo.jpg`
  const zipNormalized = String(filePath || '')
    .replace(/\\/g, '/')
    .replace(/\.zip!\//gi, '/')

  // Strip any top-level file extension so tokens like "mp4", "avi" never leak
  // into candidate phrases even when path.parse misidentifies multi-dot paths.
  const ext = parsed.ext || ''
  const withoutExt = ext
    ? String(zipNormalized).slice(0, String(zipNormalized).length - ext.length)
    : String(zipNormalized)
  const segments = withoutExt.split(/[\/\\]/).filter(Boolean)
  const fileName = segments.pop() || ''
  const folders = segments

  const folderWeight = Number(options.folderWeight || 1.5)
  const fileWeight = Number(options.fileWeight || 1)
  const tokens: PathToken[] = []

  for (const folder of folders) {
    for (const token of tokenizeSegment(folder, options)) {
      tokens.push({ token, source: 'folder', segment: folder, weight: folderWeight })
    }
  }

  for (const token of tokenizeSegment(fileName, options)) {
    tokens.push({ token, source: 'file', segment: fileName, weight: fileWeight })
  }

  return {
    folders,
    file: fileName,
    tokens,
    uniqueTokens: [...new Set(tokens.map(i => i.token))],
  }
}

function cleanComparable(value: unknown) {
  return String(value || '').replace(/[^a-zа-яё0-9]/giu, '').toLowerCase()
}

export {
  PATH_STOP_WORDS as STOP_WORDS,
  cleanComparable,
  isNoiseToken,
  normalizeToken,
  splitSegment,
  tokenizeFilePath,
  tokenizeSegment,
}
