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
    groups: match.slice(1).map((value) => (value == null ? '' : String(value))),
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
    const value = match[index]
    return value == null ? '' : String(value)
  })
}

export function isPathRegexMetaEligible(meta: PathRegexMetaLike): boolean {
  if (meta.id == null) return false
  if (String(meta.type || '') !== 'array') return false
  if (!isMetaTruthyValue(meta.parser)) return false
  if (!Boolean(String(meta.pathRegex || '').trim())) return false
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

export function extractPathRegexTagName(
  filePath: string,
  meta: PathRegexMetaLike,
): string | null {
  if (!isPathRegexMetaEligible(meta)) return null

  const pattern = String(meta.pathRegex || '').trim()
  let regex: RegExp
  try {
    regex = compilePathRegex(pattern)
  } catch {
    return null
  }

  const normalized = normalizePathForRegex(filePath)
  const match = regex.exec(normalized)
  if (!match) return null

  const tagName = applyPathRegexReplace(match, meta.pathRegexReplace).trim()
  return tagName || null
}

export function extractPathRegexTagNames(
  filePath: string,
  metas: PathRegexMetaLike[],
): PathRegexTagExtract[] {
  const results: PathRegexTagExtract[] = []

  for (const meta of metas) {
    if (!isPathRegexMetaEligible(meta)) continue
    const tagName = extractPathRegexTagName(filePath, meta)
    if (!tagName) continue

    results.push({
      metaId: Number(meta.id),
      tagName,
      createTags: shouldCreatePathRegexTags(meta),
      source: 'regex',
    })
  }

  return results
}
