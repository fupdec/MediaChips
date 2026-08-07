import {
  extractPathRegexTagName,
  testRegexMatch,
  validateRegexPattern,
} from '../../shared/pathParser/regexMeta'
import {generatePathRegexFromSample} from '../../shared/pathParser/regexGenerator'
import {
  asStringArray,
  looksLikeEchoedSample,
  looksLikeFilesystemPath,
  looksLikePathShapedPattern,
  shrinkPathShapedPattern,
  stripRegexDelimiters,
} from './localAiAssistPatterns'
import {
  hasFavoriteIntent,
  isNegatedWatchGoal,
  isWatchRelatedGoal,
  mergeFilterSuggestions,
  parseRelativeDays,
  resolveTodayIso,
  shiftDateIso,
  synthesizeFiltersFromGoal,
} from '../../shared/localAiAssistFilterGoal'


export type AssistMode = 'chat' | 'regex' | 'filter' | 'meta'

const FILTER_CONDITIONS_BY_TYPE: Record<string, string[]> = {
  string: ['like', 'not like', 'under folder', 'starts with', 'is null', 'not null', 'regex'],
  number: ['=', '!==', '>', '<', '>=', '<='],
  date: ['=', '!==', '>', '<', '>=', '<='],
  rating: ['=', '!==', '>', '<', '>=', '<='],
  boolean: ['=', '!='],
  array: ['in', 'in all', 'in only', 'not in', 'not in all', 'is null', 'not null'],
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
  context: Record<string, unknown> = {},
): Record<string, unknown> | null {
  const suggestions = asStringArray(parsed?.suggestions, 8)
  let summary = String(parsed?.summary || '').trim()
  let explanation = String(parsed?.explanation || '').trim()
  const modelFilters = normalizeFilterRows(
    Array.isArray(parsed?.filters) ? parsed.filters : [],
    context,
  )
  const synthesized = synthesizeFiltersFromGoal(context)
  const filters = mergeFilterSuggestions(modelFilters, synthesized, context)

  if (!summary && !explanation && !suggestions.length && !filters.length) return null

  // When deterministic goal parsing carried the result, prefer a clean summary.
  if (synthesized.length && (!summary || /favorite|избран/i.test(summary)) && String(context.goal || '').trim()) {
    const goal = String(context.goal).trim()
    if (isWatchRelatedGoal(goal) && !hasFavoriteIntent(goal)) {
      summary = `Filters for: ${goal}`
      if (!explanation || /favorite|избран/i.test(explanation)) {
        explanation = summary
      }
    }
  }

  return {
    summary: summary
      || (filters.length
        ? `Ready to apply ${filters.length} filter${filters.length === 1 ? '' : 's'}`
        : (suggestions[0] ? `Filter ideas: ${suggestions[0]}` : explanation.slice(0, 120))),
    suggestions,
    explanation: explanation || summary,
    filters,
  }
}

type AvailableFilterField = {
  param: string | number
  type?: string | null
  name?: string | null
}

const COND_ALIASES: Record<string, string> = {
  '≥': '>=',
  '≤': '<=',
  '≠': '!==',
  '!=': '!==',
  '==': '=',
  equals: '=',
  equal: '=',
  gt: '>',
  lt: '<',
  gte: '>=',
  lte: '<=',
  contains: 'like',
  includes: 'in',
}

function normalizeConditionToken(raw: unknown): string {
  const token = String(raw || '').trim()
  if (!token) return ''
  return COND_ALIASES[token] || COND_ALIASES[token.toLowerCase()] || token
}

function resolveAvailableField(
  row: Record<string, unknown>,
  availableFields: AvailableFilterField[],
): AvailableFilterField | null {
  if (!availableFields.length) return null
  const paramRaw = row.param ?? row.field ?? row.name
  const paramKey = String(paramRaw ?? '').trim().toLowerCase()
  if (!paramKey) return null

  const byParam = availableFields.find((field) =>
    String(field.param).toLowerCase() === paramKey,
  )
  if (byParam) return byParam

  return availableFields.find((field) =>
    String(field.name || '').trim().toLowerCase() === paramKey,
  ) || null
}

function coerceFilterValue(
  type: string,
  cond: string,
  raw: unknown,
  todayIso = '',
): unknown {
  if (cond === 'is null' || cond === 'not null') return null

  if (type === 'boolean') {
    if (typeof raw === 'boolean') return raw
    const text = String(raw ?? '').trim().toLowerCase()
    if (['1', 'true', 'yes', 'y', 'on', 'favorite'].includes(text)) return true
    if (['0', 'false', 'no', 'n', 'off'].includes(text)) return false
    return Boolean(raw)
  }

  if (type === 'number' || type === 'rating') {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw
    const parsed = Number(String(raw ?? '').replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : null
  }

  if (type === 'date') {
    return coerceDateValue(raw, todayIso)
  }

  if (type === 'array') {
    if (Array.isArray(raw)) {
      return raw.map((item) => String(item ?? '').trim()).filter(Boolean)
    }
    const text = String(raw ?? '').trim()
    if (!text) return []
    if (text.includes(',')) {
      return text.split(',').map((part) => part.trim()).filter(Boolean)
    }
    return [text]
  }

  if (raw == null) return null
  return String(raw)
}

const ISO_DATE_RE = /^(\d{4}-\d{2}-\d{2})/

function coerceDateValue(raw: unknown, todayIso: string): string | null {
  if (raw == null) return null
  const text = String(raw).trim()
  if (!text) return null
  const iso = text.match(ISO_DATE_RE)
  if (iso) return iso[1]

  const today = resolveTodayIso({today: todayIso})
  const relativeDays = parseRelativeDays(text)
  if (relativeDays != null) return shiftDateIso(today, -relativeDays)
  return null
}

function normalizeBooleanFilter(
  cond: string,
  rawVal: unknown,
): {cond: string, val: boolean} | null {
  let nextCond = cond
  if (nextCond === '!==' || nextCond === '≠' || nextCond === 'not equal') nextCond = '!='
  if (nextCond === '==' || nextCond === 'equal') nextCond = '='
  if (nextCond !== '=' && nextCond !== '!=') return null

  let truthy: boolean | null = null
  if (typeof rawVal === 'boolean') truthy = rawVal
  else {
    const text = String(rawVal ?? '').trim().toLowerCase()
    if (['1', 'true', 'yes', 'y', 'on', 'favorite'].includes(text)) truthy = true
    else if (['0', 'false', 'no', 'n', 'off'].includes(text)) truthy = false
  }

  // Model often emits {cond:'=', val:false} for "not favorite".
  if (nextCond === '=' && truthy === false) nextCond = '!='
  if (nextCond === '!=' && truthy === true) nextCond = '!='

  return {
    cond: nextCond,
    val: nextCond === '=',
  }
}

/**
 * Repair common small-model mistakes for watch/time goals:
 * favorite bias, views≈30 for "month", missing viewedAt date filter.
 */
function repairWatchRelatedFilters(
  filters: Array<Record<string, unknown>>,
  context: Record<string, unknown>,
): Array<Record<string, unknown>> {
  const goal = String(context.goal || '').trim()
  if (!goal || !isWatchRelatedGoal(goal)) return filters

  const availableFields = (Array.isArray(context.availableFields) ? context.availableFields : [])
    .map((field) => field as AvailableFilterField)
  const hasViewedAt = availableFields.some((field) => String(field.param) === 'viewedAt')
  if (!hasViewedAt) return filters

  const today = resolveTodayIso(context)
  const relativeDays = parseRelativeDays(goal)

  let next = filters.filter((row) => {
    const param = String(row.param)
    if (param === 'favorite' && !hasFavoriteIntent(goal)) return false
    // "month" often becomes views < 30 / views < 31
    if (
      param === 'views'
      && relativeDays != null
      && typeof row.val === 'number'
      && [7, 14, 30, 31, 365].includes(row.val)
    ) {
      return false
    }
    return true
  })

  const alreadyHasViewedAt = next.some((row) => String(row.param) === 'viewedAt')
  if (!alreadyHasViewedAt && relativeDays != null) {
    const cutoff = shiftDateIso(today, -relativeDays)
    next = [
      ...next,
      {
        param: 'viewedAt',
        type: 'date',
        cond: isNegatedWatchGoal(goal) ? '<' : '>=',
        val: cutoff,
        active: true,
      },
    ]
  }

  return next.slice(0, 8)
}

function normalizeFilterRows(
  rows: unknown[],
  context: Record<string, unknown>,
): Array<Record<string, unknown>> {
  const availableFields = (Array.isArray(context.availableFields) ? context.availableFields : [])
    .map((field) => field as AvailableFilterField)
    .filter((field) => field && field.param != null)

  const conditionsByType = (
    context.conditionsByType
    && typeof context.conditionsByType === 'object'
      ? context.conditionsByType
      : FILTER_CONDITIONS_BY_TYPE
  ) as Record<string, string[]>

  const todayIso = resolveTodayIso(context)

  const out: Array<Record<string, unknown>> = []
  for (const entry of rows.slice(0, 8)) {
    if (!entry || typeof entry !== 'object') continue
    const row = entry as Record<string, unknown>
    const field = resolveAvailableField(row, availableFields)
    if (!field) continue

    const type = String(field.type || row.type || 'string')
    const allowed = conditionsByType[type] || FILTER_CONDITIONS_BY_TYPE[type] || []
    let cond = normalizeConditionToken(row.cond)

    if (type === 'boolean') {
      const repaired = normalizeBooleanFilter(cond, row.val)
      if (!repaired || !allowed.includes(repaired.cond)) continue
      out.push({
        param: field.param,
        type,
        cond: repaired.cond,
        val: repaired.val,
        active: true,
      })
      continue
    }

    if (!cond || !allowed.includes(cond)) continue

    const val = coerceFilterValue(type, cond, row.val, todayIso)
    if (cond !== 'is null' && cond !== 'not null') {
      if (val == null) continue
      if (type === 'array' && Array.isArray(val) && !val.length) continue
      if (type === 'string' && String(val).trim() === '') continue
    }

    out.push({
      param: field.param,
      type,
      cond,
      val,
      active: true,
    })
  }

  return repairWatchRelatedFilters(out, context)
}

export function normalizeAssistParsed(
  mode: AssistMode | undefined,
  parsed: Record<string, unknown> | null,
  context: Record<string, unknown> = {},
): Record<string, unknown> | null {
  if (mode === 'regex') return normalizeRegexAssistParsed(parsed, context)
  if (mode === 'filter') return normalizeFilterAssistParsed(parsed, context)
  if (mode === 'meta') return normalizeFilterAssistParsed(parsed)
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
  const goal = String(context.goal || '').trim()
  const today = resolveTodayIso(context)
  const fieldLines = availableFields.slice(0, 36).map((field) => {
    const row = field as Record<string, unknown>
    return `- ${String(row.name || row.param)} (param=${JSON.stringify(row.param)}, type=${String(row.type || 'string')})`
  })

  const parts = [
    'Design MediaChips Filters-drawer rows. Return ONLY JSON: summary, filters, suggestions, explanation.',
    'Each filter: { "param": <exact availableFields param>, "type", "cond", "val" }.',
    'Conditions by type:',
    ...Object.entries(FILTER_CONDITIONS_BY_TYPE).map(
      ([type, conds]) => `  - ${type}: ${conds.join(', ')}`,
    ),
    'Critical field meanings:',
    '- views = view COUNT only. Never use views for calendar periods.',
    '- viewedAt = last watched DATE. Use for watched / not watched / не смотрел / просмотренные.',
    '- favorite only when user asks for favorites / избранное.',
    '- createdAt = date added; duration values are seconds; height/width are pixels (1080p → height >= 1080).',
    '- Pinned meta / Tags fields use their exact param from availableFields. For tag values put NAMES in val (string or string[]); the app resolves IDs.',
    'Boolean: cond "=" = YES, "!=" = NO. Never encode NO as {cond:"=", val:false}.',
    `Today (UTC): ${today}. Relative times must become absolute YYYY-MM-DD.`,
    'Examples:',
    `  “не смотрел месяц” → [{"param":"viewedAt","type":"date","cond":"<","val":"${shiftDateIso(today, -30)}"}]`,
    `  “смотрел в этом месяце” → [{"param":"viewedAt","type":"date","cond":">=","val":"${today.slice(0, 7)}-01"}]`,
    '  “избранное” → [{"param":"favorite","type":"boolean","cond":"=","val":true}]',
    '  “рейтинг > 4” → [{"param":"rating","type":"number","cond":">","val":4}]',
    '  “1080p” → [{"param":"height","type":"number","cond":">=","val":1080}]',
    '  “никогда не смотрел” → [{"param":"views","type":"number","cond":"=","val":0}]',
    '  “Tags: Lara” / “Girls: Name” → array field with cond "in" and val ["Lara"] (names, not ids)',
    'Do not invent unrelated favorite/rating filters for watch-date goals.',
    'If currentFilters exist, improve/complement them instead of repeating.',
    `Page type: ${JSON.stringify(String(context.pageType || 'media'))}`,
    `Media kind: ${JSON.stringify(String(context.mediaKind || ''))}`,
    'Available fields:',
    ...(fieldLines.length ? fieldLines : ['- (none listed)']),
    `Current filters: ${JSON.stringify(currentFilters)}`,
  ]

  if (goal) {
    parts.push(
      `PRIMARY USER REQUEST: ${JSON.stringify(goal)}`,
      'Satisfy this request using available fields only. Prefer 1–3 precise filters.',
    )
  }

  return parts
}

export function buildMetaAssistPrompt(context: Record<string, unknown>): string[] {
  return [
    'Help configure MediaChips metadata fields (chips).',
    'Return ONLY a JSON object (no markdown fences) with keys: summary, suggestions (string array of 3–6 concrete setup tips), explanation.',
    'Focus on practical settings the user can toggle: visibility, path parsing, nested tags, synonyms, pinned child fields.',
    `Context: ${JSON.stringify(context || {})}`,
  ]
}
