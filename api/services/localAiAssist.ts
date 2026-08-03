import {
  extractPathRegexTagName,
  testRegexMatch,
  validateRegexPattern,
} from '../../shared/pathParser/regexMeta'
import {generatePathRegexFromSample} from '../../shared/pathParser/regexGenerator'

type AssistMode = 'chat' | 'regex' | 'filter' | 'meta'

const FILTER_CONDITIONS_BY_TYPE: Record<string, string[]> = {
  string: ['like', 'not like', 'under folder', 'starts with', 'is null', 'not null', 'regex'],
  number: ['=', '!==', '>', '<', '>=', '<='],
  date: ['=', '!==', '>', '<', '>=', '<='],
  rating: ['=', '!==', '>', '<', '>=', '<='],
  boolean: ['=', '!='],
  array: ['in', 'in all', 'in only', 'not in', 'not in all', 'is null', 'not null'],
}

export function stripRegexDelimiters(pattern: string): string {
  const trimmed = String(pattern || '').trim()
  // Require flags so path fragments like `/Shows/` are preserved.
  const matched = trimmed.match(/^\/([\s\S]+)\/([gimsuy]+)$/)
  if (matched) return matched[1]
  return trimmed
}

export function asStringArray(value: unknown, limit = 8): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    const text = String(item || '').trim()
    if (!text) continue
    out.push(text)
    if (out.length >= limit) break
  }
  return out
}

function looksLikeFilesystemPath(pattern: string): boolean {
  if (/^(\/Users\/|\/home\/|[A-Za-z]:[\\/])/.test(pattern)) return true
  // Bare /Media/... path with no regex metacharacters is echoed context.
  return /^\/Media\//.test(pattern) && !/[\\^$*+?[\](){}|.]/.test(pattern)
}

/** True when pattern is basically an escaped copy of the sample path/text. */
export function looksLikeEchoedSample(pattern: string, sample: string): boolean {
  const rawPattern = String(pattern || '').trim()
  const rawSample = String(sample || '').trim()
  if (!rawPattern || !rawSample) return false
  if (rawPattern === rawSample) return true

  const unescaped = rawPattern.replace(/\\(.)/g, '$1')
  if (unescaped === rawSample) return true

  // Near-full-path echoes with light escaping, e.g. /Media/Library/\[Studio]\file\.mp4
  if (rawSample.length >= 12 && unescaped.length >= 12) {
    const sampleCore = rawSample.replace(/\\/g, '/').toLowerCase()
    const patternCore = unescaped.replace(/\\/g, '/').toLowerCase()
    if (patternCore === sampleCore) return true
    if (sampleCore.includes(patternCore) && patternCore.length / sampleCore.length > 0.7) return true
    if (patternCore.includes(sampleCore) && sampleCore.length / patternCore.length > 0.7) return true
  }
  return false
}

/**
 * True when the model returned a whole file-path template instead of a short regex,
 * e.g. /Media/Library/[Studio]title_(\d{4})\.mp4
 */
export function looksLikePathShapedPattern(pattern: string): boolean {
  const raw = String(pattern || '').trim()
  if (!raw) return false
  const unescaped = raw.replace(/\\(.)/g, '$1')
  if (/^(\/Users\/|\/home\/|\/Media\/|[A-Za-z]:[\\/])/.test(unescaped)) return true
  const slashCount = (unescaped.match(/\//g) || []).length
  if (slashCount >= 2 && (/\.[a-z0-9]{2,4}$/i.test(unescaped) || raw.includes('\\.'))) return true
  if (slashCount >= 3 && unescaped.length > 24) return true
  return false
}

/** First capturing group `(...)`, or null. Skips `(?:`, `(?=`, etc. */
export function extractPrimaryCaptureGroup(pattern: string): string | null {
  const raw = String(pattern || '')
  let depth = 0
  let start = -1
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (ch === '\\') {
      i += 1
      continue
    }
    if (ch === '(') {
      const isSpecial = raw[i + 1] === '?'
      if (depth === 0 && !isSpecial) start = i
      depth += 1
      continue
    }
    if (ch === ')') {
      depth -= 1
      if (depth === 0 && start >= 0) {
        const group = raw.slice(start, i + 1)
        return group.length > 2 ? group : null
      }
    }
  }
  return null
}

/** Prefer a short fragment over a full path template when the user asked in natural language. */
export function shrinkPathShapedPattern(pattern: string): string {
  const raw = String(pattern || '').trim()
  if (!looksLikePathShapedPattern(raw)) return raw
  const group = extractPrimaryCaptureGroup(raw)
  if (group && group.length + 8 < raw.length) return group
  return ''
}

function regexWorksOnSample(
  pattern: string,
  replace: string,
  sample: string,
  captureText: string,
  mode: string,
): boolean {
  if (!pattern.trim() || looksLikeFilesystemPath(pattern)) return false
  if (looksLikeEchoedSample(pattern, sample)) return false
  if (looksLikePathShapedPattern(pattern)) return false
  if (validateRegexPattern(pattern).ok === false) return false

  if (mode === 'extract' || captureText) {
    const extracted = extractPathRegexTagName(sample, {
      id: 1,
      type: 'array',
      parser: true,
      pathRegex: pattern,
      pathRegexReplace: replace || '$1',
      pathRegexEnabled: true,
    })
    if (!extracted) return false
    if (captureText && extracted.toLowerCase() !== captureText.trim().toLowerCase()) {
      // Soft check: accept if capture appears in extracted (e.g. "Season 02")
      if (!extracted.toLowerCase().includes(captureText.trim().toLowerCase())) return false
    }
    return true
  }

  return testRegexMatch(pattern, sample).ok
}

export function normalizeRegexAssistParsed(
  parsed: Record<string, unknown> | null,
  context: Record<string, unknown> = {},
): Record<string, unknown> | null {
  const sample = String(context.sample || '')
  const captureText = String(context.captureText || '').trim()
  const mode = String(context.mode || 'extract')
  const goal = String(context.goal || '').trim()

  let pattern = stripRegexDelimiters(String(parsed?.pattern || ''))
  let replace = String(parsed?.replace ?? '$1').trim() || '$1'
  let explanation = String(parsed?.explanation || '').trim()

  if (looksLikeEchoedSample(pattern, sample) || looksLikeFilesystemPath(pattern)) {
    pattern = ''
  } else if (looksLikePathShapedPattern(pattern)) {
    const shrunk = shrinkPathShapedPattern(pattern)
    if (shrunk) {
      pattern = shrunk
      if (explanation && !/short|fragment|group/i.test(explanation)) {
        explanation = `${explanation} (using capture group only)`
      }
    } else {
      pattern = ''
    }
  }

  const patternLooksValid = Boolean(
    pattern
    && validateRegexPattern(pattern).ok
    && !looksLikePathShapedPattern(pattern),
  )

  // Natural-language goal: keep the model result. Do NOT replace it with a
  // sample-based generator (that ignored the goal and always returned brackets/folder).
  if (goal) {
    if (patternLooksValid) {
      return {pattern, replace, explanation}
    }
    return null
  }

  if (patternLooksValid && !sample.trim()) {
    return {pattern, replace, explanation}
  }

  if (patternLooksValid && regexWorksOnSample(pattern, replace, sample, captureText, mode)) {
    return {pattern, replace, explanation}
  }

  const generated = generatePathRegexFromSample(sample, captureText)
  if (generated) {
    pattern = generated.pathRegex
    replace = generated.pathRegexReplace
    if (!explanation) {
      explanation = `Generated a ${generated.kind} path pattern that extracts “${captureText}” from the sample.`
    } else {
      explanation = `${explanation} (adjusted to a working ${generated.kind} pattern for the sample).`
    }
    return {pattern, replace, explanation}
  }

  if (!patternLooksValid) return null

  return {pattern, replace, explanation}
}

export function normalizeFilterAssistParsed(
  parsed: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!parsed) return null

  const suggestions = asStringArray(parsed.suggestions, 8)
  const summary = String(parsed.summary || '').trim()
  const explanation = String(parsed.explanation || '').trim()

  if (!summary && !explanation && !suggestions.length) return null

  return {
    summary: summary || (suggestions[0] ? `Filter ideas: ${suggestions[0]}` : explanation.slice(0, 120)),
    suggestions,
    explanation: explanation || summary,
  }
}

export function normalizeAssistParsed(
  mode: AssistMode | undefined,
  parsed: Record<string, unknown> | null,
  context: Record<string, unknown> = {},
): Record<string, unknown> | null {
  if (mode === 'regex') return normalizeRegexAssistParsed(parsed, context)
  if (mode === 'filter' || mode === 'meta') return normalizeFilterAssistParsed(parsed)
  return parsed
}

export function buildRegexAssistPrompt(context: Record<string, unknown>): string[] {
  const mode = String(context.mode || 'extract')
  const extractMode = mode === 'extract'
  const goal = String(context.goal || '').trim()
  const sample = String(context.sample || '')
  const parts = [
    extractMode
      ? 'Task: invent a SHORT JavaScript RegExp SOURCE for MediaChips path/tag extraction.'
      : 'Task: invent a SHORT JavaScript RegExp SOURCE for MediaChips text matching.',
    'Return ONLY a JSON object (no markdown fences, no commentary) with keys: pattern, replace, explanation.',
    'Rules:',
    '- pattern = a SHORT regex fragment only (usually under ~40 chars). Never a full file path.',
    '- BAD pattern example: /Media/Library/[Studio]title_(\\d{4})\\.mp4',
    '- GOOD pattern examples: (\\d{4})  or  (19|20)\\d{2}  or  \\[([^\\]]+)\\]  or  /([^/]+)/[^/]+$',
    '- Do NOT copy, escape, or rewrite the sample path into pattern.',
    '- Do NOT put /Users/, /Media/, /home/, or drive letters into pattern unless the user explicitly asked for a path prefix.',
    extractMode
      ? '- Prefer one capturing group; replace uses $1/$2 (default "$1").'
      : '- Prefer a capturing group when useful; replace may be "$1".',
    '- Prefer specific, non-greedy patterns over broad .* when possible.',
    '- explanation = one short sentence in the user language describing what the pattern finds.',
  ]

  if (goal) {
    parts.push(
      `PRIMARY USER REQUEST (must satisfy this): ${JSON.stringify(goal)}`,
      'Invent a NEW short pattern for that request only. Ignore sample paths and previous patterns.',
    )
  } else {
    parts.push(
      `Sample path/text: ${JSON.stringify(sample)}`,
      `Text to capture / match: ${JSON.stringify(String(context.captureText || ''))}`,
      `Current pattern (may be empty): ${JSON.stringify(String(context.pattern || ''))}`,
      `Current replace (may be empty): ${JSON.stringify(String(context.replace || '$1'))}`,
    )
  }

  parts.push(`Mode: ${JSON.stringify(mode)}`)
  return parts
}

export function buildFilterAssistPrompt(context: Record<string, unknown>): string[] {
  const availableFields = Array.isArray(context.availableFields) ? context.availableFields : []
  const currentFilters = Array.isArray(context.currentFilters) ? context.currentFilters : []
  const fieldLines = availableFields.slice(0, 40).map((field) => {
    const row = field as Record<string, unknown>
    return `- ${String(row.name || row.param)} (param=${JSON.stringify(row.param)}, type=${String(row.type || 'string')})`
  })

  return [
    'Help the user design MediaChips library filters they can apply in the Filters drawer.',
    'Return ONLY a JSON object (no markdown fences) with keys: summary, suggestions, explanation.',
    'schema:',
    '- summary: one short sentence describing the overall approach',
    '- suggestions: array of 3–6 concrete UI steps (strings), each naming a real available field and a condition/value',
    '- explanation: 1–3 short sentences clarifying why these filters help',
    'Rules:',
    '- Use ONLY fields from availableFields (by name). Do not invent fields.',
    '- Use only valid conditions for each field type:',
    ...Object.entries(FILTER_CONDITIONS_BY_TYPE).map(
      ([type, conds]) => `  - ${type}: ${conds.join(', ')}`,
    ),
    '- Prefer practical library goals: favorites, rating thresholds, path folders, duration/resolution, tag categories, empty vs filled fields.',
    '- If currentFilters already exist, improve or complement them instead of repeating them.',
    '- suggestions must be actionable, e.g. "Add Rating ≥ 4" or "Filter File path starts with /Shows/".',
    `Page type: ${JSON.stringify(String(context.pageType || 'media'))}`,
    `Media kind: ${JSON.stringify(String(context.mediaKind || ''))}`,
    'Available fields:',
    ...(fieldLines.length ? fieldLines : ['- (none listed — stick to common file/rating/favorite filters)']),
    `Current filters: ${JSON.stringify(currentFilters)}`,
  ]
}

export function buildMetaAssistPrompt(context: Record<string, unknown>): string[] {
  return [
    'Help configure MediaChips metadata fields (chips).',
    'Return ONLY a JSON object (no markdown fences) with keys: summary, suggestions (string array of 3–6 concrete setup tips), explanation.',
    'Focus on practical settings the user can toggle: visibility, path parsing, nested tags, synonyms, pinned child fields.',
    `Context: ${JSON.stringify(context || {})}`,
  ]
}
