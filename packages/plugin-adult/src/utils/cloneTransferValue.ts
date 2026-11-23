/** Shallow copy of a scraper transfer value so editing the current value never touches the reserved one. */
export function cloneTransferValue(value: unknown): unknown {
  if (Array.isArray(value)) return [...value]
  if (value && typeof value === 'object') return {...value as Record<string, unknown>}
  return value
}
