export type GoalFilterRow = {
  param: string | number
  type: string
  cond: string
  val: unknown
  active: true
}

type AvailableFilterField = {
  param: string | number
  type?: string | null
  name?: string | null
}

const ISO_DATE_RE = /^(\d{4}-\d{2}-\d{2})/

export function shiftDateIso(todayIso: string, dayDelta: number): string {
  const date = new Date(`${todayIso.slice(0, 10)}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return todayIso.slice(0, 10)
  date.setUTCDate(date.getUTCDate() + dayDelta)
  return date.toISOString().slice(0, 10)
}

export function resolveTodayIso(context: Record<string, unknown>): string {
  const raw = String(context.today || '')
  if (ISO_DATE_RE.test(raw)) return raw.slice(0, 10)
  return new Date().toISOString().slice(0, 10)
}

/** Parse "30 days", "1 month", "неделю", etc. into day count. */
export function parseRelativeDays(text: string): number | null {
  const raw = text.trim().toLowerCase()
  if (!raw) return null

  // Prefer explicit calendar phrases elsewhere; still allow rolling windows here.
  const numbered = raw.match(
    /(\d+)\s*(days?|day|дн\.?|дня|дней|день|weeks?|week|недел[яиь]?|months?|month|месяц(?:а|ев)?|years?|year|год(?:а|у)?|лет)/i,
  )
  if (numbered) {
    const amount = Number(numbered[1])
    if (!Number.isFinite(amount) || amount <= 0) return null
    const unit = numbered[2].toLowerCase()
    if (/^day|^дн|^день|^дня|^дней/.test(unit)) return amount
    if (/^week|^недел/.test(unit)) return amount * 7
    if (/^month|^месяц/.test(unit)) return amount * 30
    if (/^year|^год|^лет/.test(unit)) return amount * 365
  }

  if (/последн\w*\s+месяц|за\s+месяц|for\s+a\s+month|past\s+month|\bmonth\b|месяц/.test(raw)) {
    // "в этом месяце" is calendar — handled separately.
    if (/этом\s+месяц|this\s+month|текущ\w*\s+месяц/.test(raw)) return null
    return 30
  }
  if (/последн\w*\s+недел|за\s+недел|for\s+a\s+week|past\s+week|\bweek\b|недел/.test(raw)) {
    if (/этой\s+недел|this\s+week|текущ\w*\s+недел/.test(raw)) return null
    return 7
  }
  if (/последн\w*\s+год|за\s+год|for\s+a\s+year|past\s+year|\byear\b|\bгод\b|\bлет\b/.test(raw)) {
    if (/этом\s+год|this\s+year|текущ\w*\s+год/.test(raw)) return null
    return 365
  }
  if (/\btoday\b|сегодня/.test(raw)) return 0
  return null
}

export function isWatchRelatedGoal(goal: string): boolean {
  return /смотр|watch|viewed|просмотр|unwatched|haven'?t\s+watched|not\s+watched|never\s+watched/i.test(goal)
}

export function isNegatedWatchGoal(goal: string): boolean {
  return /не\s*смотр|не\s*просмотр|unwatched|haven'?t\s+watched|not\s+watched|never\s+watched|without\s+watch|непросмотр/i.test(goal)
}

export function isNeverWatchedGoal(goal: string): boolean {
  return /никогда\s+не\s+смотр|never\s+watched|непросмотрен|unwatched|zero\s+views|0\s+views|без\s+просмотр/i.test(goal)
}

export function hasFavoriteIntent(goal: string): boolean {
  return /избран|favorite|favourite|\bliked\b/i.test(goal)
}

export function hasRatingIntent(goal: string): boolean {
  return /рейтинг|rating|\bstars?\b|зв[её]зд/i.test(goal)
}

function hasDurationIntent(goal: string): boolean {
  return /длительность|duration|длиннее|короче|минут|minutes?|\bmins?\b|час(?:а|ов)?\b/i.test(goal)
}

function hasPathIntent(goal: string): boolean {
  return /путь|path|folder|папк|under\s+folder|в\s+папк/i.test(goal)
}

function hasAddedDateIntent(goal: string): boolean {
  return /добавлен|date\s+added|created|дата\s+добавлен|недавно\s+добав/i.test(goal)
}

function hasNameIntent(goal: string): boolean {
  return /(?:^|[\s,;])(?:имя|name|filename|файл(?:а)?\s+имя|в\s+имени)/i.test(goal)
    || /имя\s*(?:файла|содержит|like|:|=)/i.test(goal)
}

function hasBookmarkIntent(goal: string): boolean {
  return /закладк|bookmark/i.test(goal)
}

function hasResolutionIntent(goal: string): boolean {
  return /\b(?:\d{3,4}p|4k|8k|uhd|full\s*hd|fhd|\bhd\b|разрешен|resolution|высот|width|height|ширин)\b/i.test(goal)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isNumericMetaParam(param: string | number): boolean {
  return typeof param === 'number' || /^\d+$/.test(String(param))
}

function isArrayMetaField(field: AvailableFilterField): boolean {
  return String(field.type || '') === 'array' && isNumericMetaParam(field.param)
}

function cleanValueToken(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitValueList(raw: string): string[] {
  return String(raw || '')
    .split(/[,;|]/)
    .map((part) => cleanValueToken(part))
    .filter((part) => part.length >= 1)
}

function fieldByParam(
  availableFields: AvailableFilterField[],
  param: string,
): AvailableFilterField | null {
  return availableFields.find((field) => String(field.param) === param) || null
}

function fieldByName(
  availableFields: AvailableFilterField[],
  name: string,
): AvailableFilterField | null {
  const key = name.trim().toLowerCase()
  if (!key) return null
  return availableFields.find((field) => String(field.name || '').trim().toLowerCase() === key) || null
}

function findTagsField(availableFields: AvailableFilterField[]): AvailableFilterField | null {
  return fieldByName(availableFields, 'Tags')
    || fieldByName(availableFields, 'Tag')
    || fieldByName(availableFields, 'Теги')
    || fieldByName(availableFields, 'Тег')
    || availableFields.find((field) => isArrayMetaField(field) && /tag/i.test(String(field.name || '')))
    || null
}

function pushFilter(
  out: GoalFilterRow[],
  field: AvailableFilterField | null,
  cond: string,
  val: unknown,
) {
  if (!field) return
  out.push({
    param: field.param,
    type: String(field.type || 'string'),
    cond,
    val,
    active: true,
  })
}

function startOfMonthIso(todayIso: string): string {
  return `${todayIso.slice(0, 7)}-01`
}

function startOfWeekIso(todayIso: string): string {
  const date = new Date(`${todayIso}T00:00:00.000Z`)
  const day = date.getUTCDay() || 7 // Mon=1..Sun=7 style-ish; JS Sun=0
  const mondayOffset = day === 0 ? -6 : 1 - day
  return shiftDateIso(todayIso, mondayOffset)
}

function startOfYearIso(todayIso: string): string {
  return `${todayIso.slice(0, 4)}-01-01`
}

/** Calendar window start for “this month/week/year”, else null. */
export function resolveCalendarStart(goal: string, todayIso: string): string | null {
  const raw = goal.toLowerCase()
  if (/этом\s+месяц|this\s+month|текущ\w*\s+месяц/.test(raw)) return startOfMonthIso(todayIso)
  if (/этой\s+недел|this\s+week|текущ\w*\s+недел/.test(raw)) return startOfWeekIso(todayIso)
  if (/этом\s+год|this\s+year|текущ\w*\s+год/.test(raw)) return startOfYearIso(todayIso)
  return null
}

function parseCompareOp(raw: string | undefined): string {
  const token = String(raw || '').trim()
  if (token === '≥') return '>='
  if (token === '≤') return '<='
  if (token === '≠' || token === '!=') return '!=='
  if (['>', '<', '>=', '<=', '=', '=='].includes(token)) {
    return token === '==' ? '=' : token
  }
  return '>='
}

function parseNumberToken(raw: string): number | null {
  const parsed = Number(String(raw).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

/** Convert user duration phrasing into stored seconds when unit is minutes/hours. */
function durationToSeconds(amount: number, unit: string | undefined): number {
  const u = String(unit || '').toLowerCase()
  if (/^час|^hour|^hr/.test(u)) return amount * 3600
  if (/^мин|^min/.test(u)) return amount * 60
  if (/^сек|^sec/.test(u)) return amount
  // Bare numbers with “длиннее/короче” usually mean minutes in RU UX.
  if (!u) return amount * 60
  return amount
}

/**
 * Deterministic filter rows from a natural-language goal.
 * Small local models often fail here; these patterns are trusted over model JSON.
 */
export function synthesizeFiltersFromGoal(
  context: Record<string, unknown>,
): GoalFilterRow[] {
  const goal = String(context.goal || '').trim()
  if (!goal) return []

  const availableFields = (Array.isArray(context.availableFields) ? context.availableFields : [])
    .map((field) => field as AvailableFilterField)
    .filter((field) => field && field.param != null)
  if (!availableFields.length) return []

  const today = resolveTodayIso(context)
  const out: GoalFilterRow[] = []

  if (hasFavoriteIntent(goal)) {
    const negated = /не\s*избран|not\s+favorite|unfavorite|non-?favorite/i.test(goal)
    pushFilter(
      out,
      fieldByParam(availableFields, 'favorite'),
      negated ? '!=' : '=',
      !negated,
    )
  }

  if (hasRatingIntent(goal)) {
    const match = goal.match(
      /(?:рейтинг|rating)\s*(>=|<=|>|<|=|≥|≤)?\s*(\d+(?:[.,]\d+)?)/i,
    ) || goal.match(
      /(\d+(?:[.,]\d+)?)\s*\+?\s*(?:звезд|stars?)/i,
    ) || goal.match(
      /(?:выше|over|at\s+least)\s*(\d+(?:[.,]\d+)?)/i,
    )
    if (match) {
      const amount = parseNumberToken(match[2] || match[1])
      if (amount != null) {
        const op = match[2] ? parseCompareOp(match[1]) : '>='
        const field = fieldByParam(availableFields, 'rating')
        pushFilter(out, field, op === '=' ? '=' : op, amount)
      }
    }
  }

  // Never watched (no time window) → views = 0
  if (isNeverWatchedGoal(goal) && parseRelativeDays(goal) == null && !resolveCalendarStart(goal, today)) {
    pushFilter(out, fieldByParam(availableFields, 'views'), '=', 0)
  }

  if (isWatchRelatedGoal(goal)) {
    const viewedAt = fieldByParam(availableFields, 'viewedAt')
    const calendarStart = resolveCalendarStart(goal, today)
    const relativeDays = parseRelativeDays(goal)

    if (viewedAt && calendarStart) {
      pushFilter(
        out,
        viewedAt,
        isNegatedWatchGoal(goal) ? '<' : '>=',
        calendarStart,
      )
    } else if (viewedAt && relativeDays != null) {
      pushFilter(
        out,
        viewedAt,
        isNegatedWatchGoal(goal) ? '<' : '>=',
        shiftDateIso(today, -relativeDays),
      )
    } else if (!isNegatedWatchGoal(goal) && !isNeverWatchedGoal(goal) && /просмотренн|viewed|watched/i.test(goal)) {
      // “просмотренные” without a date → at least one view
      pushFilter(out, fieldByParam(availableFields, 'views'), '>', 0)
    }
  }

  if (hasDurationIntent(goal)) {
    const match = goal.match(
      /(?:длительность|duration|длиннее|короче)\s*(>=|<=|>|<|=|≥|≤)?\s*(\d+(?:[.,]\d+)?)\s*(мин(?:ут(?:ы|а)?)?|minutes?|mins?|сек(?:унд(?:ы|а)?)?|seconds?|secs?|час(?:а|ов)?|hours?|hrs?)?/i,
    ) || goal.match(
      /(\d+(?:[.,]\d+)?)\s*(мин(?:ут(?:ы|а)?)?|minutes?|mins?|сек(?:унд(?:ы|а)?)?|seconds?|час(?:а|ов)?|hours?)/i,
    )
    if (match) {
      const amount = parseNumberToken(match[2] || match[1])
      if (amount != null) {
        let op = parseCompareOp(match[1])
        if (/короче|shorter|under|менее/i.test(goal) && !match[1]) op = '<'
        if (/длиннее|longer|over|более/i.test(goal) && !match[1]) op = '>'
        const seconds = durationToSeconds(amount, match[3])
        pushFilter(out, fieldByParam(availableFields, 'duration'), op, seconds)
      }
    }
  }

  if (hasPathIntent(goal)) {
    const match = goal.match(
      /(?:путь|path|folder|папк[аеиу]?|under\s+folder)\s*(?:contains|like|включает|:|=)?\s*["'`]?([^"'`\n,;]+)["'`]?/i,
    )
    const folder = String(match?.[1] || '').trim()
    if (folder && folder.length >= 2 && !/^(contains|like|включает)$/i.test(folder)) {
      const pathField = fieldByParam(availableFields, 'path')
      const conds = ['under folder', 'like', 'starts with']
      // Prefer under folder when phrasing asks for folder.
      const cond = /папк|folder|under/i.test(goal) && !/like|содерж/i.test(goal)
        ? 'under folder'
        : 'like'
      if (pathField) {
        pushFilter(out, pathField, conds.includes(cond) ? cond : 'like', folder)
      }
    }
  }

  if (hasAddedDateIntent(goal)) {
    const calendarStart = resolveCalendarStart(goal, today)
    const relativeDays = parseRelativeDays(goal) ?? (
      /недавно|recent/i.test(goal) ? 30 : null
    )
    const createdAt = fieldByParam(availableFields, 'createdAt')
    if (createdAt && calendarStart) {
      pushFilter(out, createdAt, '>=', calendarStart)
    } else if (createdAt && relativeDays != null) {
      pushFilter(out, createdAt, '>=', shiftDateIso(today, -relativeDays))
    }
  }

  if (hasNameIntent(goal)) {
    const match = goal.match(
      /(?:имя(?:\s+файла)?|name|filename)\s*(?:contains|like|содержит|:|=)?\s*["'`]?([^"'`\n,;]+)/i,
    )
    const token = cleanValueToken(match?.[1] || '')
    if (token.length >= 2) {
      pushFilter(out, fieldByParam(availableFields, 'name'), 'like', token)
    }
  }

  if (hasBookmarkIntent(goal)) {
    const bookmark = fieldByParam(availableFields, 'bookmark')
    if (/без\s+заклад|no\s+bookmark|empty\s+bookmark|без\s+bookmark/i.test(goal)) {
      pushFilter(out, bookmark, 'is null', null)
    } else {
      const match = goal.match(/(?:закладк\w*|bookmark)\s*[:=]?\s*["'`]?([^"'`\n,;]+)/i)
      const token = cleanValueToken(match?.[1] || '')
      if (token && !/^(есть|yes|true|on)$/i.test(token)) {
        pushFilter(out, bookmark, 'like', token)
      } else {
        pushFilter(out, bookmark, 'not null', null)
      }
    }
  }

  if (hasResolutionIntent(goal)) {
    synthesizeResolutionFilters(out, goal, availableFields)
  }

  synthesizeMetaFieldFilters(out, goal, availableFields)

  return dedupeFiltersByParam(out)
}

function synthesizeResolutionFilters(
  out: GoalFilterRow[],
  goal: string,
  availableFields: AvailableFilterField[],
) {
  const height = fieldByParam(availableFields, 'height')
  const width = fieldByParam(availableFields, 'width')
  const labeled = goal.match(/\b(4320|2160|1440|1080|720|480)p\b/i)
  if (labeled) {
    const px = Number(labeled[1])
    pushFilter(out, height, '>=', px)
    return
  }
  if (/\b(?:8k|4320)\b/i.test(goal)) {
    pushFilter(out, height, '>=', 4320)
    return
  }
  if (/\b(?:4k|uhd|2160)\b/i.test(goal)) {
    pushFilter(out, height, '>=', 2160)
    return
  }
  if (/\b(?:full\s*hd|fhd|1080)\b/i.test(goal)) {
    pushFilter(out, height, '>=', 1080)
    return
  }
  if (/\b(?:hd|720)\b/i.test(goal) && !/full\s*hd|fhd/i.test(goal)) {
    pushFilter(out, height, '>=', 720)
    return
  }

  const heightMatch = goal.match(/(?:высот\w*|height)\s*(>=|<=|>|<|=|≥|≤)?\s*(\d{3,4})/i)
  if (heightMatch) {
    const amount = parseNumberToken(heightMatch[2])
    if (amount != null) pushFilter(out, height, parseCompareOp(heightMatch[1]), amount)
  }
  const widthMatch = goal.match(/(?:ширин\w*|width)\s*(>=|<=|>|<|=|≥|≤)?\s*(\d{3,4})/i)
  if (widthMatch) {
    const amount = parseNumberToken(widthMatch[2])
    if (amount != null) pushFilter(out, width, parseCompareOp(widthMatch[1]), amount)
  }
}

function arrayCondFromGoal(goal: string, around = ''): string {
  const blob = `${goal} ${around}`.toLowerCase()
  if (/not\s+in|без|кроме|exclude|исключ/.test(blob)) return 'not in'
  if (/in\s+only|только|exclusive|exclusively/.test(blob)) return 'in only'
  if (/in\s+all|все\s+из|all\s+of/.test(blob)) return 'in all'
  return 'in'
}

function truncateAtNextFieldAssignment(
  value: string,
  currentName: string,
  fieldNames: string[],
): string {
  let next = value
  for (const other of fieldNames) {
    if (other.toLowerCase() === currentName.toLowerCase()) continue
    if (other.length < 2) continue
    const cut = next.search(new RegExp(`[,|;]\\s*${escapeRegExp(other)}\\s*[:=]`, 'i'))
    if (cut >= 0) next = next.slice(0, cut)
  }
  return next.trim()
}

/**
 * Match pinned/meta fields mentioned by their UI name, e.g. `Girls: Lara`, `Tags Lara`.
 * Values stay as names; the UI resolves them to tag IDs on Apply.
 */
function synthesizeMetaFieldFilters(
  out: GoalFilterRow[],
  goal: string,
  availableFields: AvailableFilterField[],
) {
  // Longer names first so "Release Date" wins over "Date".
  const namedFields = [...availableFields]
    .filter((field) => String(field.name || '').trim().length >= 2)
    .sort((a, b) => String(b.name).length - String(a.name).length)
  const fieldNames = namedFields.map((field) => String(field.name || '').trim())

  for (const field of namedFields) {
    const name = String(field.name || '').trim()
    const type = String(field.type || 'string')
    const esc = escapeRegExp(name)

    if (
      new RegExp(`(?:без|empty|no|missing|без\\s+значен)\\s+${esc}`, 'i').test(goal)
      || new RegExp(`${esc}\\s+(?:пуст\\w*|empty|is\\s+null|без\\s+значен)`, 'i').test(goal)
    ) {
      if (type === 'array' || type === 'string') {
        pushFilter(out, field, 'is null', null)
        continue
      }
    }

    if (
      new RegExp(`${esc}\\s+(?:заполнен\\w*|not\\s+null|is\\s+set)`, 'i').test(goal)
      || new RegExp(`(?:есть\\s+значен\\w*|has\\s+value)\\s+${esc}`, 'i').test(goal)
    ) {
      if (type === 'array' || type === 'string') {
        pushFilter(out, field, 'not null', null)
        continue
      }
    }

    if (type === 'array' && isArrayMetaField(field)) {
      const assigned = goal.match(
        new RegExp(`${esc}\\s*[:=]\\s*["']?([^"'\\n;]+)`, 'i'),
      ) || goal.match(
        new RegExp(`(?:тег(?:и)?|tags?)\\s+[:=]?\\s*["']?([^"'\\n,;]+)["']?\\s+(?:в|in|для|from)\\s+${esc}`, 'i'),
      )
      if (assigned?.[1]) {
        const clipped = truncateAtNextFieldAssignment(assigned[1], name, fieldNames)
        const values = splitValueList(clipped).filter((item) => item.length >= 2)
        if (values.length) {
          pushFilter(out, field, arrayCondFromGoal(goal, assigned[0]), values)
        }
      }
      continue
    }

    if (type === 'string' && !['name', 'path', 'bookmark'].includes(String(field.param))) {
      const assigned = goal.match(
        new RegExp(`${esc}\\s*[:=]\\s*["']?([^"'\\n,;]+)`, 'i'),
      )
      const token = cleanValueToken(
        truncateAtNextFieldAssignment(assigned?.[1] || '', name, fieldNames),
      )
      if (token.length >= 2) {
        pushFilter(out, field, 'like', token)
      }
      continue
    }

    if (type === 'number' || type === 'rating') {
      // Skip built-ins handled elsewhere (rating/duration/height…).
      if (['rating', 'duration', 'height', 'width', 'views', 'filesize'].includes(String(field.param))) {
        continue
      }
      const assigned = goal.match(
        new RegExp(`${esc}\\s*(>=|<=|>|<|=|≥|≤)?\\s*(\\d+(?:[.,]\\d+)?)`, 'i'),
      )
      if (assigned) {
        const amount = parseNumberToken(assigned[2])
        if (amount != null) {
          pushFilter(out, field, parseCompareOp(assigned[1]), amount)
        }
      }
    }
  }

  // Generic “тег Name” / “tag Name” when no field was prefixed.
  if (!out.some((row) => String(row.type) === 'array' && Array.isArray(row.val) && row.val.length)) {
    const generic = goal.match(
      /(?:^|[\s,;])(?:тег(?:и)?|tags?)\s*[:=]?\s*["']?([^"'\\n,;]+)/i,
    )
    if (generic?.[1]) {
      const values = splitValueList(generic[1]).filter((item) => item.length >= 2)
      const tagsField = findTagsField(availableFields)
      if (tagsField && values.length) {
        pushFilter(out, tagsField, arrayCondFromGoal(goal, generic[0]), values)
      }
    }
  }
}

export function dedupeFiltersByParam(rows: GoalFilterRow[]): GoalFilterRow[] {
  const map = new Map<string, GoalFilterRow>()
  for (const row of rows) {
    map.set(String(row.param), row)
  }
  return [...map.values()]
}

/**
 * Prefer deterministic goal rows; keep complementary model rows that do not fight the goal.
 */
export function mergeFilterSuggestions(
  modelRows: Array<Record<string, unknown>>,
  synthesized: GoalFilterRow[],
  context: Record<string, unknown>,
): Array<Record<string, unknown>> {
  const goal = String(context.goal || '').trim()
  if (!synthesized.length) return dedupeFiltersByParam(modelRows as GoalFilterRow[])

  const byParam = new Map<string, Record<string, unknown>>()
  for (const row of synthesized) {
    byParam.set(String(row.param), row)
  }

  for (const row of modelRows) {
    const key = String(row.param)
    if (!key || byParam.has(key)) continue
    if (key === 'favorite' && !hasFavoriteIntent(goal)) continue
    if (key === 'rating' && !hasRatingIntent(goal)) continue
    if (
      key === 'views'
      && isWatchRelatedGoal(goal)
      && !isNeverWatchedGoal(goal)
      && typeof row.val === 'number'
      && [7, 14, 30, 31, 365].includes(row.val)
    ) {
      continue
    }
    byParam.set(key, row)
  }

  return [...byParam.values()].slice(0, 8)
}
