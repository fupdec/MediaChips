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

function hasUpdatedDateIntent(goal: string): boolean {
  return /обновл|редактир|date\s+updated|updated\s+at|edited|editing\s+date|дата\s+редакт|дата\s+обновл/i.test(goal)
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

function hasFilesizeIntent(goal: string): boolean {
  return /размер|filesize|file\s*size|\b\d+(?:[.,]\d+)?\s*(?:mb|gb|kb|миб|гиб)\b/i.test(goal)
}

function hasExtIntent(goal: string): boolean {
  return /формат|extension|\bext\b|\.?(mp4|mkv|avi|mov|wmv|webm|m4v|mp3|flac|jpg|jpeg|png|webp)\b/i.test(goal)
}

/** Explicit view-count goals like "views > 5", not "не смотрел месяц". */
function hasViewsCountIntent(goal: string): boolean {
  if (isNegatedWatchGoal(goal) || isNeverWatchedGoal(goal)) return false
  if (/(?:просмотр(?:ов|а|ы)?|views)\s*(?:>=|<=|>|<|=|≥|≤)\s*\d+/i.test(goal)) return true
  if (/\d+\s*\+?\s*(?:просмотр(?:ов|а)?|views)\b/i.test(goal)) return true
  if (/(?:больше|меньше|over|under|at\s+least|more\s+than|less\s+than)\s*\d+\s*(?:просмотр|views)/i.test(goal)) return true
  return false
}

/** In-progress / continue-watching via resume time. */
function hasResumeIntent(goal: string): boolean {
  return /недосмотр|не\s*досмотр|continue\s+watch|in\s+progress|с\s+прогресс|есть\s+прогресс|resume(?:\s+time)?|частично\s+смотр|начат\w*\s+смотр|watching\s+progress/i.test(goal)
}

function hasCodecIntent(goal: string): boolean {
  return /(?:^|[\s,;])(?:кодек|codec)\b/i.test(goal)
    || /\b(h\.?26[45]|hevc|avc|av1|vp9|vp8|aac|flac|opus|prores|xvid|mpeg-?[24]?)\b/i.test(goal)
}

function hasBitrateIntent(goal: string): boolean {
  return /битрейт|bitrate|\b\d+(?:[.,]\d+)?\s*(?:kbps|mbps|mbit|kbit)\b/i.test(goal)
}

function hasFpsIntent(goal: string): boolean {
  return /(?:^|[\s,;])(?:fps|framerate|кадр(?:ов)?(?:\/|\\)?с|частота\s+кадр)/i.test(goal)
    || /\b\d{2,3}\s*fps\b/i.test(goal)
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

  if (hasViewsCountIntent(goal)) {
    const match = goal.match(
      /(?:просмотр(?:ов|а|ы)?|views)\s*(>=|<=|>|<|=|≥|≤)\s*(\d+(?:[.,]\d+)?)/i,
    ) || goal.match(
      /(\d+(?:[.,]\d+)?)\s*\+?\s*(?:просмотр(?:ов|а)?|views)\b/i,
    ) || goal.match(
      /(?:больше|over|at\s+least|more\s+than)\s*(\d+(?:[.,]\d+)?)\s*(?:просмотр|views)/i,
    ) || goal.match(
      /(?:меньше|under|less\s+than)\s*(\d+(?:[.,]\d+)?)\s*(?:просмотр|views)/i,
    )
    if (match) {
      const amount = parseNumberToken(match[2] || match[1])
      if (amount != null) {
        let op = '>='
        if (match[2]) op = parseCompareOp(match[1])
        else if (/меньше|under|less\s+than/i.test(match[0])) op = '<'
        else if (/\+/.test(match[0])) op = '>='
        else if (/больше|over|at\s+least|more\s+than/i.test(match[0])) op = '>'
        else op = '>='
        pushFilter(out, fieldByParam(availableFields, 'views'), op, amount)
      }
    }
  }

  if (hasResumeIntent(goal)) {
    const negated = /без\s+прогресс|no\s+progress|not\s+started|не\s+начат|без\s+недосмотр/i.test(goal)
    pushFilter(
      out,
      fieldByParam(availableFields, 'time'),
      negated ? '=' : '>',
      0,
    )
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
    synthesizeDurationFilters(out, goal, availableFields)
  }

  if (hasFilesizeIntent(goal)) {
    synthesizeFilesizeFilters(out, goal, availableFields)
  }

  if (hasExtIntent(goal)) {
    synthesizeExtFilters(out, goal, availableFields)
  }

  if (hasCodecIntent(goal)) {
    synthesizeCodecFilters(out, goal, availableFields)
  }

  if (hasBitrateIntent(goal)) {
    synthesizeBitrateFilters(out, goal, availableFields)
  }

  if (hasFpsIntent(goal)) {
    synthesizeFpsFilters(out, goal, availableFields)
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

  if (hasUpdatedDateIntent(goal)) {
    const calendarStart = resolveCalendarStart(goal, today)
    const relativeDays = parseRelativeDays(goal) ?? (
      /недавно|recent/i.test(goal) ? 30 : null
    )
    const updatedAt = fieldByParam(availableFields, 'updatedAt')
    if (updatedAt && calendarStart) {
      pushFilter(out, updatedAt, '>=', calendarStart)
    } else if (updatedAt && relativeDays != null) {
      pushFilter(out, updatedAt, '>=', shiftDateIso(today, -relativeDays))
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

function synthesizeDurationFilters(
  out: GoalFilterRow[],
  goal: string,
  availableFields: AvailableFilterField[],
) {
  const duration = fieldByParam(availableFields, 'duration')
  if (!duration) return

  const range = goal.match(
    /(?:от|from)\s*(\d+(?:[.,]\d+)?)\s*(?:до|to|-|—)\s*(\d+(?:[.,]\d+)?)\s*(мин(?:ут(?:ы|а)?)?|minutes?|mins?|сек(?:унд(?:ы|а)?)?|seconds?|час(?:а|ов)?|hours?|hrs?)?/i,
  ) || goal.match(
    /(\d+(?:[.,]\d+)?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)\s*(мин(?:ут(?:ы|а)?)?|minutes?|mins?|сек|seconds?|час(?:а|ов)?|hours?)/i,
  )
  if (range) {
    const a = parseNumberToken(range[1])
    const b = parseNumberToken(range[2])
    if (a != null && b != null) {
      const unit = range[3]
      const lo = durationToSeconds(Math.min(a, b), unit)
      const hi = durationToSeconds(Math.max(a, b), unit)
      pushFilter(out, duration, '>=', lo)
      pushFilter(out, duration, '<=', hi)
      return
    }
  }

  const match = goal.match(
    /(?:длительность|duration|длиннее|короче)\s*(>=|<=|>|<|=|≥|≤)?\s*(\d+(?:[.,]\d+)?)\s*(мин(?:ут(?:ы|а)?)?|minutes?|mins?|сек(?:унд(?:ы|а)?)?|seconds?|secs?|час(?:а|ов)?|hours?|hrs?)?/i,
  ) || goal.match(
    /(\d+(?:[.,]\d+)?)\s*(мин(?:ут(?:ы|а)?)?|minutes?|mins?|сек(?:унд(?:ы|а)?)?|seconds?|час(?:а|ов)?|hours?)/i,
  )
  if (!match) return
  const amount = parseNumberToken(match[2] || match[1])
  if (amount == null) return
  let op = parseCompareOp(match[1])
  if (/короче|shorter|under|менее/i.test(goal) && !match[1]) op = '<'
  if (/длиннее|longer|over|более/i.test(goal) && !match[1]) op = '>'
  pushFilter(out, duration, op, durationToSeconds(amount, match[3]))
}

function filesizeToBytes(amount: number, unit: string | undefined): number {
  const u = String(unit || 'mb').toLowerCase()
  if (/^gb|^гиб|^gi/.test(u)) return Math.round(amount * 1024 * 1024 * 1024)
  if (/^kb|^киб|^ki/.test(u)) return Math.round(amount * 1024)
  // default MB
  return Math.round(amount * 1024 * 1024)
}

function synthesizeFilesizeFilters(
  out: GoalFilterRow[],
  goal: string,
  availableFields: AvailableFilterField[],
) {
  const filesize = fieldByParam(availableFields, 'filesize')
  if (!filesize) return

  const sized = goal.match(
    /(?:размер|filesize|file\s*size)\s*(>=|<=|>|<|=|≥|≤)?\s*(\d+(?:[.,]\d+)?)\s*(mb|gb|kb|миб|гиб|mib|gib)?/i,
  )
  if (sized) {
    const amount = parseNumberToken(sized[2])
    if (amount == null) return
    let op = parseCompareOp(sized[1])
    if (/меньше|under|smaller|ниже/i.test(goal) && !sized[1]) op = '<'
    if (/больше|over|larger|выше/i.test(goal) && !sized[1]) op = '>'
    pushFilter(out, filesize, op === '=' ? '>=' : op, filesizeToBytes(amount, sized[3] || 'mb'))
    return
  }

  const bare = goal.match(/(\d+(?:[.,]\d+)?)\s*(mb|gb|kb|миб|гиб|mib|gib)\b/i)
  if (!bare) return
  const amount = parseNumberToken(bare[1])
  if (amount == null) return
  let op = '>='
  if (/меньше|under|smaller|ниже/i.test(goal)) op = '<'
  if (/больше|over|larger|выше/i.test(goal)) op = '>'
  pushFilter(out, filesize, op, filesizeToBytes(amount, bare[2]))
}

function synthesizeExtFilters(
  out: GoalFilterRow[],
  goal: string,
  availableFields: AvailableFilterField[],
) {
  const ext = fieldByParam(availableFields, 'ext')
  if (!ext) return
  const listed = goal.match(
    /(?:формат|extension|\bext\b)\s*[:=]?\s*([a-z0-9.,\s]+)/i,
  )
  const fromList = listed?.[1]
    ? splitValueList(listed[1]).map((item) => item.replace(/^\./, '').toLowerCase()).filter(Boolean)
    : []
  const found = [...goal.matchAll(/\b(mp4|mkv|avi|mov|wmv|webm|m4v|mp3|flac|jpg|jpeg|png|webp)\b/gi)]
    .map((m) => m[1].toLowerCase())
  const values = [...new Set((fromList.length ? fromList : found).filter(Boolean))]
  if (values.length) {
    pushFilter(out, ext, 'in', values)
  }
}

function normalizeCodecToken(raw: string): string {
  const token = cleanValueToken(raw).toLowerCase().replace(/\s+/g, '')
  if (!token) return ''
  if (/^h\.?265$|^hevc$/.test(token)) return 'hevc'
  if (/^h\.?264$|^avc$/.test(token)) return 'h264'
  if (token === 'av1') return 'av1'
  if (token === 'vp9') return 'vp9'
  if (token === 'vp8') return 'vp8'
  return token
}

function synthesizeCodecFilters(
  out: GoalFilterRow[],
  goal: string,
  availableFields: AvailableFilterField[],
) {
  const codec = fieldByParam(availableFields, 'codec')
  if (!codec) return
  const labeled = goal.match(/(?:кодек|codec)\s*[:=]?\s*([a-z0-9.\/,\s-]+)/i)
  const fromLabel = labeled?.[1]
    ? splitValueList(labeled[1]).map(normalizeCodecToken).filter(Boolean)
    : []
  const found = [...goal.matchAll(/\b(h\.?26[45]|hevc|avc|av1|vp9|vp8|aac|flac|opus|prores|xvid|mpeg-?[24]?)\b/gi)]
    .map((m) => normalizeCodecToken(m[1]))
    .filter(Boolean)
  const values = [...new Set(fromLabel.length ? fromLabel : found)]
  // Prefer the first codec token — string filters use "like".
  if (values[0]) pushFilter(out, codec, 'like', values[0])
}

function bitrateToKbps(amount: number, unit: string | undefined): number {
  const u = String(unit || '').toLowerCase()
  if (/^mbps|^mbit/.test(u)) return amount * 1000
  if (/^kbps|^kbit/.test(u)) return amount
  // Bare numbers with "bitrate" are usually kbps in media tools.
  return amount
}

function synthesizeBitrateFilters(
  out: GoalFilterRow[],
  goal: string,
  availableFields: AvailableFilterField[],
) {
  const bitrate = fieldByParam(availableFields, 'bitrate')
  if (!bitrate) return
  const match = goal.match(
    /(?:битрейт|bitrate)\s*(>=|<=|>|<|=|≥|≤)?\s*(\d+(?:[.,]\d+)?)\s*(kbps|mbps|mbit|kbit)?/i,
  ) || goal.match(
    /(\d+(?:[.,]\d+)?)\s*(kbps|mbps|mbit|kbit)\b/i,
  )
  if (!match) return
  const amount = parseNumberToken(match[2] || match[1])
  if (amount == null) return
  const op = match[2] ? parseCompareOp(match[1]) : '>='
  const unit = match[3] || match[2]
  pushFilter(out, bitrate, op === '=' ? '>=' : op, bitrateToKbps(amount, unit))
}

function synthesizeFpsFilters(
  out: GoalFilterRow[],
  goal: string,
  availableFields: AvailableFilterField[],
) {
  const fps = fieldByParam(availableFields, 'fps')
  if (!fps) return
  const match = goal.match(
    /(?:fps|framerate|кадр(?:ов)?(?:\/|\\)?с|частота\s+кадр\w*)\s*(>=|<=|>|<|=|≥|≤)?\s*(\d+(?:[.,]\d+)?)/i,
  ) || goal.match(
    /(\d{2,3})\s*fps\b/i,
  )
  if (!match) return
  const amount = parseNumberToken(match[2] || match[1])
  if (amount == null) return
  const op = match[2] ? parseCompareOp(match[1]) : '>='
  pushFilter(out, fps, op, amount)
}

function synthesizeResolutionFilters(
  out: GoalFilterRow[],
  goal: string,
  availableFields: AvailableFilterField[],
) {
  const height = fieldByParam(availableFields, 'height')
  const width = fieldByParam(availableFields, 'width')
  const exact = /(?:^|[\s,;])(?:только|exactly|exact)(?=[\s,;]|$)/i.test(goal)
    || /\b={1,2}\s*(?:4320|2160|1440|1080|720|480)p?\b/i.test(goal)
  const heightCond = exact ? '=' : '>='

  const labeled = goal.match(/\b(4320|2160|1440|1080|720|480)p\b/i)
  if (labeled) {
    const px = Number(labeled[1])
    pushFilter(out, height, heightCond, px)
    return
  }
  if (/\b(?:8k|4320)\b/i.test(goal)) {
    pushFilter(out, height, heightCond, 4320)
    return
  }
  if (/\b(?:4k|uhd|2160)\b/i.test(goal)) {
    pushFilter(out, height, heightCond, 2160)
    return
  }
  if (/\b(?:full\s*hd|fhd|1080)\b/i.test(goal)) {
    pushFilter(out, height, heightCond, 1080)
    return
  }
  if (/\b(?:hd|720)\b/i.test(goal) && !/full\s*hd|fhd/i.test(goal)) {
    pushFilter(out, height, heightCond, 720)
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
  // Bare "без Field" means empty (is null) and is handled before assignments.
  if (/not\s+in|кроме|exclude|исключ|without\s+tag|без\s+тег/.test(blob)) return 'not in'
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
      const excluded = goal.match(
        new RegExp(`(?:кроме|exclude|without|без\\s+тег(?:а|ов)?|not)\\s+${esc}\\s*[:=]\\s*["']?([^"'\\n;]+)`, 'i'),
      ) || goal.match(
        new RegExp(`${esc}\\s*(?:кроме|exclude|without|not)\\s*[:=]\\s*["']?([^"'\\n;]+)`, 'i'),
      )
      if (excluded?.[1]) {
        const clipped = truncateAtNextFieldAssignment(excluded[1], name, fieldNames)
        const values = splitValueList(clipped).filter((item) => item.length >= 2)
        if (values.length) {
          pushFilter(out, field, 'not in', values)
          continue
        }
      }
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
      if (['rating', 'duration', 'height', 'width', 'views', 'filesize', 'bitrate', 'fps', 'time'].includes(String(field.param))) {
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
    // Allow multiple conditions on the same field (e.g. duration >= x AND <= y).
    map.set(`${String(row.param)}::${String(row.cond)}`, row)
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
    byParam.set(`${String(row.param)}::${String(row.cond)}`, row)
  }

  for (const row of modelRows) {
    const key = `${String(row.param)}::${String(row.cond)}`
    if (!key || byParam.has(key)) continue
    if (String(row.param) === 'favorite' && !hasFavoriteIntent(goal)) continue
    if (String(row.param) === 'rating' && !hasRatingIntent(goal)) continue
    if (
      String(row.param) === 'views'
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

/**
 * Strip phrases we already know how to parse. If almost nothing remains,
 * the goal can be satisfied without calling the local LLM.
 */
export function residualUnparsedFilterGoal(goal: string): string {
  let rest = String(goal || '')
  const patterns = [
    /не\s*смотрел\w*(?:\s+(?:за\s+)?(?:последн\w*\s+)?)?(?:\d+\s*)?(?:день|дня|дней|недел\w*|месяц\w*|год\w*|лет)?/gi,
    /не\s*просмотр\w*/gi,
    /никогда\s+не\s+смотр\w*/gi,
    /просмотренн\w*/gi,
    /смотрел\w*(?:\s+в\s+этом\s+(?:месяце|году)|\s+на\s+этой\s+неделе)?/gi,
    /not\s+watched(?:\s+(?:for\s+)?(?:a\s+)?(?:week|month|year|\d+\s*days?))?/gi,
    /never\s+watched/gi,
    /unwatched/gi,
    /watched(?:\s+this\s+(?:week|month|year))?/gi,
    /избранн\w*|favorite|favourite|\bliked\b/gi,
    /рейтинг\s*(?:>=|<=|>|<|=|≥|≤)?\s*\d+(?:[.,]\d+)?/gi,
    /rating\s*(?:>=|<=|>|<|=|≥|≤)?\s*\d+(?:[.,]\d+)?/gi,
    /\d+(?:[.,]\d+)?\s*\+?\s*(?:звезд\w*|stars?)/gi,
    /(?:длительность|duration|длиннее|короче)\s*(?:>=|<=|>|<|=|≥|≤)?\s*\d+(?:[.,]\d+)?\s*(?:мин\w*|min\w*|сек\w*|sec\w*|час\w*|hour\w*)?/gi,
    /(?:от|from)\s*\d+(?:[.,]\d+)?\s*(?:до|to|-|—)\s*\d+(?:[.,]\d+)?\s*(?:мин\w*|min\w*|сек\w*|час\w*|hour\w*)?/gi,
    /\d+(?:[.,]\d+)?\s*[-–—]\s*\d+(?:[.,]\d+)?\s*(?:мин\w*|min\w*|сек\w*|час\w*|hour\w*|mins?)/gi,
    /\d+(?:[.,]\d+)?\s*(?:мин(?:ут(?:ы|а)?)?|minutes?|mins?|сек\w*|seconds?|час(?:а|ов)?|hours?)/gi,
    /(?:размер|filesize|file\s*size)\s*(?:>=|<=|>|<|=|≥|≤)?\s*\d+(?:[.,]\d+)?\s*(?:mb|gb|kb|миб|гиб)?/gi,
    /\d+(?:[.,]\d+)?\s*(?:mb|gb|kb|миб|гиб|mib|gib)\b/gi,
    /(?:формат|extension|\bext\b)\s*[:=]?\s*[a-z0-9.,\s]+/gi,
    /\b(?:mp4|mkv|avi|mov|wmv|webm|m4v|mp3|flac|jpg|jpeg|png|webp)\b/gi,
    /(?:кодек|codec)\s*[:=]?\s*[a-z0-9.\/,\s-]+/gi,
    /\b(?:h\.?26[45]|hevc|avc|av1|vp9|vp8|aac|flac|opus|prores|xvid|mpeg-?[24]?)\b/gi,
    /(?:битрейт|bitrate)\s*(?:>=|<=|>|<|=|≥|≤)?\s*\d+(?:[.,]\d+)?\s*(?:kbps|mbps|mbit|kbit)?/gi,
    /\d+(?:[.,]\d+)?\s*(?:kbps|mbps|mbit|kbit)\b/gi,
    /(?:fps|framerate|кадр(?:ов)?(?:\/|\\)?с|частота\s+кадр\w*)\s*(?:>=|<=|>|<|=|≥|≤)?\s*\d+(?:[.,]\d+)?/gi,
    /\d{2,3}\s*fps\b/gi,
    /(?:^|[\s,;])(?:только|exactly|exact)(?=[\s,;]|$)/gi,
    /\b(?:4320|2160|1440|1080|720|480)p\b/gi,
    /\b(?:8k|4k|uhd|full\s*hd|fhd|hd)\b/gi,
    /(?:высот\w*|height|ширин\w*|width)\s*(?:>=|<=|>|<|=|≥|≤)?\s*\d{3,4}/gi,
    /(?:имя(?:\s+файла)?|name|filename)\s*(?:contains|like|содержит|:|=)?\s*["'`]?[^"'`\n,;]+/gi,
    /(?:закладк\w*|bookmark)\s*[:=]?\s*["'`]?[^"'`\n,;]*/gi,
    /без\s+заклад\w*|no\s+bookmark|empty\s+bookmark/gi,
    /(?:путь|path|folder|папк\w*|under\s+folder)\s*(?:contains|like|включает|:|=)?\s*["'`]?[^"'`\n,;]+/gi,
    /(?:добавлен\w*|date\s+added|created|дата\s+добавлен\w*|недавно\s+добав\w*)[^,]*/gi,
    /(?:обновл\w*|редактир\w*|date\s+updated|updated\s+at|edited|editing\s+date|дата\s+редакт\w*|дата\s+обновл\w*)[^,]*/gi,
    /(?:просмотр(?:ов|а|ы)?|views)\s*(?:>=|<=|>|<|=|≥|≤)\s*\d+(?:[.,]\d+)?/gi,
    /\d+\s*\+?\s*(?:просмотр(?:ов|а)?|views)\b/gi,
    /(?:больше|меньше|over|under|at\s+least|more\s+than|less\s+than)\s*\d+\s*(?:просмотр(?:ов|а)?|views)\b/gi,
    /недосмотр[а-яёa-z]*|не\s*досмотр[а-яёa-z]*|continue\s+watch(?:ing)?|in\s+progress|с\s+прогресс[а-яёa-z]*|есть\s+прогресс|resume(?:\s+time)?|частично\s+смотр[а-яёa-z]*|начат[а-яёa-z]*\s+смотр[а-яёa-z]*|watching\s+progress/gi,
    /без\s+прогресс[а-яёa-z]*|no\s+progress|not\s+started|не\s+начат[а-яёa-z]*/gi,
    /(?:в\s+)?этом\s+(?:месяце|году)|этой\s+неделе|this\s+(?:month|week|year)/gi,
    /последн\w*\s+(?:месяц|недел\w*|год)|за\s+(?:месяц|недел\w*|год)|for\s+a\s+(?:month|week|year)|past\s+(?:month|week|year)/gi,
    /без\s+[A-Za-zА-Яа-яЁё0-9][\wА-Яа-яЁё0-9 -]*/gi,
    /(?:empty|no|missing)\s+[A-Za-zА-Яа-яЁё0-9][\wА-Яа-яЁё0-9 -]*/gi,
    /[A-Za-zА-Яа-яЁё0-9][\wА-Яа-яЁё0-9 -]{1,40}\s*(?:пуст\w*|empty|is\s+null|заполнен\w*|not\s+null)/gi,
    /[A-Za-zА-Яа-яЁё0-9][\wА-Яа-яЁё0-9 -]{1,40}\s*[:=]\s*["']?[^"'`\n;]+/gi,
    /(?:тег(?:и)?|tags?)\s*[:=]?\s*["']?[^"'`\n,;]+/gi,
    /(?:кроме|exclude|without|без\s+тег(?:а|ов)?|not)\s+[A-Za-zА-Яа-яЁё0-9][\wА-Яа-яЁё0-9 -]{1,40}\s*[:=]\s*["']?[^"'`\n;]+/gi,
    /и\s+|and\s+|plus\s+/gi,
  ]
  for (const pattern of patterns) {
    rest = rest.replace(pattern, ' ')
  }
  return rest.replace(/[,;|/+\-–—]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export function isFilterGoalCoveredLocally(
  goal: string,
  filters: Array<Record<string, unknown>>,
): boolean {
  if (!filters.length) return false
  const residual = residualUnparsedFilterGoal(goal)
  // Tiny leftovers like "все", "please", "pls" are fine.
  if (!residual) return true
  if (residual.length <= 4) return true
  if (/^(пожалуйста|please|pls|все|all|only|только)$/i.test(residual)) return true
  return false
}

export function buildLocalFilterAssistSuggestion(
  context: Record<string, unknown>,
  options: {allowPartial?: boolean} = {},
): Record<string, unknown> | null {
  const goal = String(context.goal || '').trim()
  const filters = synthesizeFiltersFromGoal(context)
  if (!goal || !filters.length) return null
  const covered = isFilterGoalCoveredLocally(goal, filters)
  if (!covered && !options.allowPartial) return null
  const residual = residualUnparsedFilterGoal(goal)
  return {
    summary: `Filters for: ${goal}`,
    explanation: `Filters for: ${goal}`,
    suggestions: [],
    filters,
    local: true,
    partial: !covered,
    residual: covered ? '' : residual,
  }
}

export function canSatisfyFilterGoalLocally(
  context: Record<string, unknown>,
): boolean {
  return buildLocalFilterAssistSuggestion(context) != null
}
