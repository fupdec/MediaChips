/** Coerce settings / override values into a boolean with optional fallback. */
export function parseBooleanSetting(value: unknown, fallback = false): boolean {
  if (value == null || value === '') return fallback
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  const normalized = String(value).toLowerCase()
  return normalized === 'true' || normalized === '1'
}
