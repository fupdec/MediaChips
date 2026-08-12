export function clampCalendarMonth(year: number, month: number): {year: number; month: number} {
  let y = Number.isFinite(year) ? Math.trunc(year) : new Date().getFullYear()
  let m = Number.isFinite(month) ? Math.trunc(month) : (new Date().getMonth() + 1)
  if (m < 1) {
    y -= 1
    m = 12
  } else if (m > 12) {
    y += 1
    m = 1
  }
  if (y < 1970) y = 1970
  if (y > 2100) y = 2100
  return {year: y, month: m}
}

/** Inclusive start / exclusive end as YYYY-MM-DD for a calendar month. */
export function monthBounds(year: number, month: number): {start: string; end: string} {
  const {year: y, month: m} = clampCalendarMonth(year, month)
  const start = `${y}-${String(m).padStart(2, '0')}-01`
  const nextMonth = m === 12 ? 1 : m + 1
  const nextYear = m === 12 ? y + 1 : y
  const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
  return {start, end}
}

/** Shift a calendar month by delta months. */
export function shiftCalendarMonth(
  year: number,
  month: number,
  delta: number,
): {year: number; month: number} {
  const base = clampCalendarMonth(year, month)
  const absolute = base.year * 12 + (base.month - 1) + Math.trunc(delta || 0)
  const y = Math.floor(absolute / 12)
  const m = (absolute % 12) + 1
  return clampCalendarMonth(y, m)
}

/** Next calendar day as YYYY-MM-DD (UTC arithmetic on the ISO day string). */
export function nextIsoDay(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || '').trim())
  if (!match) return day
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  date.setUTCDate(date.getUTCDate() + 1)
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
