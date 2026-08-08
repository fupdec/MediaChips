import {PATH_STOP_WORDS} from './stopWords'
import {PATH_NOISE_PATTERNS_SHARED, matchesPathNoise} from './noisePatterns'

export interface PathPhrase {
  tokens: string[]
  source: 'folder' | 'file'
  segment: string
  raw: string
  kind?: 'full' | 'subtoken' | 'single'
}

export interface PathPhraseParseResult {
  folders: string[]
  file: string
  phrases: PathPhrase[]
}

export interface PathTagMatch {
  tagId: unknown
  metaId: unknown
  mediaId: unknown
  score: number
  source: string
  tagTokens: string[]
  phrase: PathPhrase
}

export interface TagLikeForParser {
  id: unknown
  metaId: unknown
  name?: string | null
  synonyms?: string | null
}

export interface MatchPathTagsOptions {
  preferLongestMatch?: boolean
  minTokenLength?: number
  matchPrecision?: number
}

interface MatchPrecisionConfig {
  precision: number
  emitSubphraseSingles: boolean
  singleTokenMinLength: number
  folderOnlySingleTokens: boolean
}

function resolveMatchPrecisionConfig(options: MatchPathTagsOptions = {}): MatchPrecisionConfig {
  const raw = Number(options.matchPrecision)
  const precision = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0.5

  return {
    precision,
    emitSubphraseSingles: precision >= 0.25,
    singleTokenMinLength: Math.max(2, Math.min(6, Math.round(2 + (1 - precision) * 4))),
    folderOnlySingleTokens: precision < 0.35,
  }
}

function phrasePassesPrecision(
  phrase: PathPhrase,
  tagTokens: string[],
  config: MatchPrecisionConfig,
) {
  if (tagTokens.length > 1) return true

  const token = phrase.tokens[0]
  if (!token || token.length < config.singleTokenMinLength) return false

  const kind = phrase.kind || (phrase.tokens.length > 1 ? 'full' : 'single')

  if (kind === 'subtoken' && !config.emitSubphraseSingles) return false

  if (config.folderOnlySingleTokens) {
    if (kind === 'subtoken') return false
    if (phrase.source === 'file') {
      return kind === 'single' && phrase.raw === token
    }
  }

  return true
}

export interface TagIndexEntry {
  tag: TagLikeForParser
  tagTokens: string[]
  tokenKey: string
}

export interface TagPathIndex {
  byTokenKey: Map<string, TagIndexEntry[]>
  tagCount: number
  termCount: number
}

/** @deprecated Prefer PATH_STOP_WORDS; kept for existing pathParser callers. */
const STOP_WORDS = PATH_STOP_WORDS

const NOISE_PATTERNS = PATH_NOISE_PATTERNS_SHARED

const PHRASE_DELIMITERS = /[,;&+|/]+/
const STRUCTURAL_DELIMITERS = /[_\-.]+/

function normalizeToken(value: unknown) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/giu, '')
}

function splitCamelCase(value: string) {
  return value
    .replace(/([a-zа-яё])([A-ZА-ЯЁ])/g, '$1 $2')
    .replace(/([A-ZА-ЯЁ]+)([A-ZА-ЯЁ][a-zа-яё])/g, '$1 $2')
}

function isNoiseToken(token: string, minLength = 2) {
  if (!token || token.length < minLength) return true
  if (PATH_STOP_WORDS.has(token)) return true
  return matchesPathNoise(token, NOISE_PATTERNS)
}

function tokenizeWords(text: string, minLength = 2) {
  return splitCamelCase(String(text || ''))
    .replace(/#\d+/g, (match) => ` ${match.slice(1)} `)
    .replace(/[()[\]{}]+/g, ' ')
    .split(/\s+/)
    .map(normalizeToken)
    .filter((token) => token && !isNoiseToken(token, minLength))
}

function tokenizeTagTerm(text: string) {
  return splitCamelCase(String(text || ''))
    .replace(/#\d+/g, (match) => ` ${match.slice(1)} `)
    .replace(/[()[\]{}]+/g, ' ')
    .split(/\s+/)
    .map(normalizeToken)
    .filter(Boolean)
}

function splitPhraseParts(segment: string) {
  const parts: string[] = []
  let rest = String(segment || '')

  const parenPattern = /[([{]([^)\]}]+)[)\]}]/g
  let match: RegExpExecArray | null
  while ((match = parenPattern.exec(rest)) !== null) {
    for (const part of match[1].split(PHRASE_DELIMITERS)) {
      const trimmed = part.trim()
      if (trimmed) parts.push(trimmed)
    }
  }
  rest = rest.replace(parenPattern, ' ')

  for (const part of rest.split(PHRASE_DELIMITERS)) {
    const trimmed = part.trim()
    if (trimmed) parts.push(trimmed)
  }

  return parts
}

function splitStructuralChunks(part: string) {
  return String(part || '')
    .split(STRUCTURAL_DELIMITERS)
    .map((piece) => piece.trim())
    .filter(Boolean)
}

function isJoinableStructuralChunk(chunk: string) {
  if (!chunk || isNumericOnlyChunk(chunk)) return false
  const tokens = tokenizeTagTerm(chunk)
  if (tokens.length !== 1) return false
  return !isNoiseToken(tokens[0])
}

function phraseKey(tokens: string[]) {
  return tokens.join('\u0001')
}

function isNumericOnlyChunk(text: string) {
  return /^\d+([\-_.\s/]\d+)*$/.test(String(text || '').trim())
}

function addPhrase(
  phrases: PathPhrase[],
  seen: Set<string>,
  raw: string,
  source: 'folder' | 'file',
  segment: string,
  minLength: number,
  precisionConfig: MatchPrecisionConfig,
) {
  if (isNumericOnlyChunk(raw)) return

  const tokens = tokenizeTagTerm(raw)
  if (!tokens.length) return

  const phraseKind: PathPhrase['kind'] = tokens.length > 1 ? 'full' : 'single'
  const multiKey = phraseKey(tokens)
  if (!seen.has(multiKey)) {
    seen.add(multiKey)
    phrases.push({
      tokens: [...tokens],
      source,
      segment,
      raw: raw.trim(),
      kind: phraseKind,
    })
  }

  if (tokens.length > 1) {
    // Contiguous multi-token subphrases so "Silvia Saint" matches inside
    // "Silvia Saint QTGMC" / "Silvia Saint and Nikita Denise".
    for (let len = 2; len < tokens.length; len += 1) {
      for (let start = 0; start <= tokens.length - len; start += 1) {
        const sub = tokens.slice(start, start + len)
        if (sub.some((token) => STOP_WORDS.has(token))) continue
        const subKey = phraseKey(sub)
        if (seen.has(subKey)) continue
        seen.add(subKey)
        phrases.push({
          tokens: [...sub],
          source,
          segment,
          raw: sub.join(' '),
          kind: 'full',
        })
      }
    }
  }

  if (tokens.length > 1 && precisionConfig.emitSubphraseSingles) {
    for (const token of tokens) {
      if (isNoiseToken(token, precisionConfig.singleTokenMinLength)) continue
      if (STOP_WORDS.has(token)) continue
      const singleKey = phraseKey([token])
      if (seen.has(singleKey)) continue
      seen.add(singleKey)
      phrases.push({
        tokens: [token],
        source,
        segment,
        raw: token,
        kind: 'subtoken',
      })
    }

    const lastToken = tokens[tokens.length - 1]
    if (/^\d+$/.test(lastToken) && lastToken.length >= 2) {
      const bridged = [tokens[0], lastToken]
      const bridgedKey = phraseKey(bridged)
      if (!seen.has(bridgedKey)) {
        seen.add(bridgedKey)
        phrases.push({
          tokens: bridged,
          source,
          segment,
          raw: `${tokens[0]} ${lastToken}`,
          kind: 'full',
        })
      }
    }
  }
}

function extractPhrasesFromSegment(
  segment: string,
  source: 'folder' | 'file',
  minLength: number,
  precisionConfig: MatchPrecisionConfig,
) {
  const phrases: PathPhrase[] = []
  const seen = new Set<string>()

  for (const part of splitPhraseParts(segment)) {
    const structuralChunks = splitStructuralChunks(part)

    for (const chunk of structuralChunks) {
      addPhrase(phrases, seen, chunk, source, segment, minLength, precisionConfig)
    }

    // Recombine First.Last / First_Last / First-Last across structural delimiters.
    // Only single-token non-noise chunks join, so CamelCase site names and quality
    // tokens still break adjacency (MomsTeachSex.Koda.Monroe.1080p → "Koda Monroe").
    let joinRun: string[] = []
    const flushJoinRun = () => {
      if (joinRun.length >= 2) {
        addPhrase(phrases, seen, joinRun.join(' '), source, segment, minLength, precisionConfig)
      }
      joinRun = []
    }

    for (const chunk of structuralChunks) {
      if (isJoinableStructuralChunk(chunk)) {
        joinRun.push(chunk)
        continue
      }
      flushJoinRun()
    }
    flushJoinRun()
  }

  return phrases
}

function stripExtension(filePath: string) {
  const normalized = String(filePath || '').replace(/\\/g, '/')
  const baseName = normalized.split('/').pop() || ''
  const dotIndex = baseName.lastIndexOf('.')
  if (dotIndex <= 0) return String(filePath || '')
  return String(filePath || '').slice(0, String(filePath || '').length - (baseName.length - dotIndex))
}

/**
 * ZIP gallery paths look like `/album.zip!/nested/photo.jpg`. Treat the archive
 * as a folder segment (`album`) so path tagging matches folder/file phrases
 * instead of emitting a spurious `zip` token.
 */
function normalizeVirtualZipPathForParsing(filePath: string): string {
  return String(filePath || '').replace(/\\/g, '/').replace(/\.zip!\//gi, '/')
}

function extractPathPhrases(filePath: string, options: MatchPathTagsOptions = {}): PathPhraseParseResult {
  const minLength = options.minTokenLength ?? 2
  const precisionConfig = resolveMatchPrecisionConfig(options)
  const withoutExt = stripExtension(normalizeVirtualZipPathForParsing(filePath))
  const segments = withoutExt.split(/[\\/]/).filter(Boolean)
  const fileName = segments.pop() || ''
  const folders = segments
  const phrases: PathPhrase[] = []

  for (const folder of folders) {
    phrases.push(...extractPhrasesFromSegment(folder, 'folder', minLength, precisionConfig))
  }
  phrases.push(...extractPhrasesFromSegment(fileName, 'file', minLength, precisionConfig))

  return { folders, file: fileName, phrases }
}

function getTagTerms(tag: TagLikeForParser) {
  const synonyms = String(tag.synonyms || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  return [tag.name, ...synonyms].filter(Boolean) as string[]
}

function getTagTokenGroups(tag: TagLikeForParser, _minLength: number) {
  const groups: string[][] = []
  const seen = new Set<string>()

  const addGroup = (tokens: string[]) => {
    if (!tokens.length) return
    const key = phraseKey(tokens)
    if (seen.has(key)) return
    seen.add(key)
    groups.push(tokens)
  }

  for (const term of getTagTerms(tag)) {
    const tokens = tokenizeTagTerm(term)
    addGroup(tokens)

    const raw = String(term || '')
    const hasDelimiter = /[\s,/_\-.]+/.test(raw)
    if (!hasDelimiter && tokens.length > 1) {
      const compact = normalizeToken(raw)
      if (compact) addGroup([compact])
    }
  }

  return groups
}

function tokensEqual(a: string[], b: string[]) {
  return a.length === b.length && a.every((token, index) => token === b[index])
}

function isTokenPrefixPrefix(shorter: string[], longer: string[]) {
  if (shorter.length >= longer.length) return false
  return shorter.every((token, index) => token === longer[index])
}

function applyLongestMatch(matches: PathTagMatch[], preferLongestMatch: boolean) {
  if (!preferLongestMatch || matches.length < 2) return matches

  const byMeta = new Map<unknown, PathTagMatch[]>()
  for (const match of matches) {
    const key = match.metaId
    if (!byMeta.has(key)) byMeta.set(key, [])
    byMeta.get(key)!.push(match)
  }

  const result: PathTagMatch[] = []
  for (const group of byMeta.values()) {
    const sorted = [...group].sort((a, b) => b.tagTokens.length - a.tagTokens.length)
    const kept: PathTagMatch[] = []

    for (const match of sorted) {
      const suppressed = kept.some((existing) => isTokenPrefixPrefix(match.tagTokens, existing.tagTokens))
      if (!suppressed) kept.push(match)
    }

    result.push(...kept)
  }

  return result
}

function dedupeMatches(matches: PathTagMatch[]) {
  const seen = new Set<string>()

  return matches.filter((match) => {
    const key = `${match.mediaId}:${match.metaId}:${match.tagId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function finalizeMatches(matches: PathTagMatch[], preferLongestMatch: boolean) {
  return dedupeMatches(applyLongestMatch(matches, preferLongestMatch))
}

function buildTagPathIndex(tags: TagLikeForParser[], options: MatchPathTagsOptions = {}): TagPathIndex {
  const minLength = options.minTokenLength ?? 2
  const byTokenKey = new Map<string, TagIndexEntry[]>()
  let termCount = 0

  for (const tag of tags) {
    for (const tagTokens of getTagTokenGroups(tag, minLength)) {
      const tokenKey = phraseKey(tagTokens)
      termCount += 1
      const entry: TagIndexEntry = { tag, tagTokens, tokenKey }
      if (!byTokenKey.has(tokenKey)) byTokenKey.set(tokenKey, [])
      byTokenKey.get(tokenKey)!.push(entry)
    }
  }

  return {
    byTokenKey,
    tagCount: tags.length,
    termCount,
  }
}

function matchPathToTagsFromPhrasesWithIndex(
  parsed: PathPhraseParseResult,
  mediaId: unknown,
  index: TagPathIndex,
  options: MatchPathTagsOptions = {},
) {
  const preferLongestMatch = options.preferLongestMatch !== false
  const precisionConfig = resolveMatchPrecisionConfig(options)
  const matches: PathTagMatch[] = []

  for (const phrase of parsed.phrases) {
    const entries = index.byTokenKey.get(phraseKey(phrase.tokens))
    if (!entries) continue

    for (const entry of entries) {
      if (!phrasePassesPrecision(phrase, entry.tagTokens, precisionConfig)) continue

      matches.push({
        tagId: entry.tag.id,
        metaId: entry.tag.metaId,
        mediaId,
        score: 1,
        source: 'exact',
        tagTokens: entry.tagTokens,
        phrase,
      })
    }
  }

  return finalizeMatches(matches, preferLongestMatch)
}

function matchPathToTagsFromPhrases(
  parsed: PathPhraseParseResult,
  mediaId: unknown,
  tags: TagLikeForParser[],
  options: MatchPathTagsOptions = {},
) {
  const index = buildTagPathIndex(tags, options)
  return matchPathToTagsFromPhrasesWithIndex(parsed, mediaId, index, options)
}

function matchPathsToTagsBatch(
  paths: Array<{ path: string; mediaId: unknown }>,
  tags: TagLikeForParser[],
  options: MatchPathTagsOptions = {},
) {
  const matchOptions = {
    preferLongestMatch: options.preferLongestMatch !== false,
    minTokenLength: options.minTokenLength ?? 2,
  }
  const index = buildTagPathIndex(tags, matchOptions)
  const matches: PathTagMatch[] = []

  for (const item of paths) {
    if (!item?.path) continue
    const parsed = extractPathPhrases(item.path, matchOptions)
    matches.push(
      ...matchPathToTagsFromPhrasesWithIndex(parsed, item.mediaId, index, matchOptions),
    )
  }

  return matches
}

function matchPathToTags(
  filePath: string,
  mediaId: unknown,
  tags: TagLikeForParser[],
  options: MatchPathTagsOptions = {},
) {
  const parsed = extractPathPhrases(filePath, options)
  return matchPathToTagsFromPhrases(parsed, mediaId, tags, options)
}

function exactMatchPath(filePath: string, tag: TagLikeForParser, options: MatchPathTagsOptions = {}) {
  return matchPathToTags(filePath, null, [tag], options).length > 0
}

export {
  NOISE_PATTERNS,
  STOP_WORDS,
  applyLongestMatch,
  buildTagPathIndex,
  exactMatchPath,
  extractPathPhrases,
  getTagTokenGroups,
  isNoiseToken,
  matchPathToTags,
  matchPathToTagsFromPhrases,
  matchPathToTagsFromPhrasesWithIndex,
  matchPathsToTagsBatch,
  normalizeToken,
  tokenizeWords,
  tokensEqual,
}
