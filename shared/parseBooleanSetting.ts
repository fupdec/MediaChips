const TRUE_VALUES = ['1', 'true', 'yes', 'on'] as const
const FALSE_VALUES = ['0', 'false', 'no', 'off'] as const

/** Coerce settings / override / env-like values into a boolean with optional fallback. */
export function parseBooleanSetting(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null || value === '') return fallback
  if (value === true || value === 1) return true
  if (value === false || value === 0) return false
  const normalized = String(value).toLowerCase()
  if ((TRUE_VALUES as readonly string[]).includes(normalized)) return true
  if ((FALSE_VALUES as readonly string[]).includes(normalized)) return false
  return fallback
}
