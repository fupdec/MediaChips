import { isMetaTruthyValue } from '../schemas/coercion'

export interface PathRegexMetaLike {
  id?: unknown
  type?: string | null
  parser?: boolean | number | string | null
  pathRegex?: string | null
  pathRegexReplace?: string | null
  pathRegexCreateTags?: boolean | number | string | null
  pathRegexEnabled?: boolean | number | string | null
}

export interface PathRegexTagExtract {
  metaId: number
  tagName: string
  createTags: boolean
  source: 'regex'
}

export type RegexValidationCode = 'empty' | 'invalid'

export type RegexValidateResult =
  | {ok: true}
  | {ok: false; code: RegexValidationCode; message: string; detail?: string}

export function normalizePathForRegex(filePath: string): string {
  return String(filePath || '').replace(/\\/g, '/')
}

export function compilePathRegex(pattern: string): RegExp {
  return new RegExp(pattern, 'iu')
}

export function compileRegexPattern(pattern: string, flags = 'iu'): RegExp {
  return new RegExp(pattern, flags)
}

export function validateRegexPattern(
  pattern: string,
  flags = 'iu',
): RegexValidateResult {
  const trimmed = String(pattern || '').trim()
  if (!trimmed) {
    return {
      ok: false,
      code: 'empty',
      message: 'Regex must not be empty',
    }
  }

  try {
    compileRegexPattern(trimmed, flags)
    return {ok: true}
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      code: 'invalid',
      message: `Invalid regex: ${detail}`,
      detail,
    }
  }
}

export type RegexMatchTestResult =
  | {ok: true; matched: string; groups: string[]}
  | {
    ok: false
    reason: 'empty' | 'invalid' | 'no_match'
    code: 'empty' | 'invalid' | 'no_match'
    message: string
    detail?: string
  }

export function testRegexMatch(
  pattern: string,
  sample: string,
  flags = 'i',
): RegexMatchTestResult {
  const trimmed = String(pattern || '').trim()
  if (!trimmed) {
    return {
      ok: false,
      reason: 'empty',
      code: 'empty',
      message: 'Regex must not be empty',
    }
  }

  let regex: RegExp
  try {
    regex = compileRegexPattern(trimmed, flags)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      reason: 'invalid',
      code: 'invalid',
      message: `Invalid regex: ${detail}`,
      detail,
    }
  }

  const match = regex.exec(String(sample || ''))
  if (!match) {
    return {
      ok: false,
      reason: 'no_match',
      code: 'no_match',
      message: 'No match in the sample text',
    }
  }

  return {
    ok: true,
    matched: match[0],
    // No capturing groups → expose the full match as $1 so replace templates work.
    groups: match.length > 1
      ? match.slice(1).map((value) => (value == null ? '' : String(value)))
      : [String(match[0])],
  }
}

export function validatePathRegex(pattern: string): RegexValidateResult {
  return validateRegexPattern(pattern, 'iu')
}

export function applyPathRegexReplace(match: RegExpExecArray, template?: string | null): string {
  const rawTemplate = template == null || template === '' ? '$1' : String(template)

  return rawTemplate.replace(/\$(\d+|\$)/g, (token, group: string) => {
    if (group === '$') return '$'
    const index = Number(group)
    if (!Number.isFinite(index) || index < 0) return token
    if (index === 1 && match.length <= 1) {
      return match[0] == null ? '' : String(match[0])
    }
    const value = match[index]
    return value == null ? '' : String(value)
  })
}

function uniqueTagNames(names: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const name of names) {
    const trimmed = name.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }
  return result
}

function tagNamesFromRegexMatch(match: RegExpExecArray, template?: string | null): string[] {
  const replaced = applyPathRegexReplace(match, template).trim()
  if (replaced) return [replaced]

  const names: string[] = []
  for (let i = 1; i < match.length; i++) {
    const value = match[i] == null ? '' : String(match[i]).trim()
    if (value) names.push(value)
  }
  if (names.length) return uniqueTagNames(names)

  const full = match[0] == null ? '' : String(match[0]).trim()
  return full ? [full] : []
}

function compileGlobalPathRegex(pattern: string): RegExp {
  const regex = compilePathRegex(pattern)
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`
  return new RegExp(regex.source, flags)
}

export function isPathRegexMetaEligible(meta: PathRegexMetaLike): boolean {
  if (meta.id == null) return false
  if (String(meta.type || '') !== 'array') return false
  if (!isMetaTruthyValue(meta.parser)) return false
  if (!String(meta.pathRegex || '').trim()) return false
  // Missing flag = legacy rows: treat as enabled when a pattern exists.
  if (meta.pathRegexEnabled === undefined || meta.pathRegexEnabled === null) return true
  return isMetaTruthyValue(meta.pathRegexEnabled)
}

export function shouldCreatePathRegexTags(meta: PathRegexMetaLike): boolean {
  if (meta.pathRegexCreateTags === undefined || meta.pathRegexCreateTags === null) {
    return true
  }
  return isMetaTruthyValue(meta.pathRegexCreateTags)
}

export function extractPathRegexTagNameList(
  filePath: string,
  meta: PathRegexMetaLike,
): string[] {
  if (!isPathRegexMetaEligible(meta)) return []

  const pattern = String(meta.pathRegex || '').trim()
  let regex: RegExp
  try {
    regex = compileGlobalPathRegex(pattern)
  } catch {
    return []
  }

  const normalized = normalizePathForRegex(filePath)
  const names: string[] = []
  for (const match of normalized.matchAll(regex)) {
    names.push(...tagNamesFromRegexMatch(match as unknown as RegExpExecArray, meta.pathRegexReplace))
  }
  return uniqueTagNames(names)
}

export function extractPathRegexTagName(
  filePath: string,
  meta: PathRegexMetaLike,
): string | null {
  return extractPathRegexTagNameList(filePath, meta)[0] ?? null
}

export function extractPathRegexTagNames(
  filePath: string,
  metas: PathRegexMetaLike[],
): PathRegexTagExtract[] {
  const results: PathRegexTagExtract[] = []

  for (const meta of metas) {
    if (!isPathRegexMetaEligible(meta)) continue
    const createTags = shouldCreatePathRegexTags(meta)
    for (const tagName of extractPathRegexTagNameList(filePath, meta)) {
      results.push({
        metaId: Number(meta.id),
        tagName,
        createTags,
        source: 'regex',
      })
    }
  }

  return results
}
