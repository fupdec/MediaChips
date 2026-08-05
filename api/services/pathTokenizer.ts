import type { PathToken, TokenizeOptions, TokenizeResult } from '../types/pathTokenizer'
import path from 'path'
import {PATH_STOP_WORDS} from '../../shared/pathParser/stopWords'

const NOISE_PATTERNS = [
  /^(?:19|20)\d{2}$/,
  /^\d{3,4}p$/,
  /^\d+k$/,
  /^x26[45]$/,
  /^h26[45]$/,
  /^hevc$/,
  /^avc$/,
  /^aac$/,
  /^mp[34]$/,
  /^mkv$/,
  /^mov$/,
  /^avi$/,
  /^webm$/,
  /^jpg$/,
  /^jpeg$/,
  /^png$/,
  /^gif$/,
  /^web$/,
  /^www$/,
  /^http$/,
  /^https$/,
]

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
  if (PATH_STOP_WORDS.has(token)) return true
  return NOISE_PATTERNS.some(pattern => pattern.test(token))
}

function tokenizeSegment(segment: unknown, options: TokenizeOptions = {}) {
  return splitSegment(segment)
    .map(normalizeToken)
    .filter(token => !isNoiseToken(token, options))
}

function tokenizeFilePath(filePath: string, options: TokenizeOptions = {}): TokenizeResult {
  const parsed = path.parse(String(filePath || ''))
  const withoutExt = filePath ? String(filePath).slice(0, String(filePath).length - parsed.ext.length) : ''
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
