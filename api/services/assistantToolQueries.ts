export function resolveAssistantToolQuery(args: Record<string, unknown>): string {
  return String(args.query || args.q || '')
}

export function clampAssistantToolLimit(
  value: unknown,
  {max, fallback}: {max: number; fallback: number},
): number {
  const raw = Number(value)
  if (!Number.isFinite(raw)) return fallback
  return Math.min(max, Math.max(1, Math.round(raw) || fallback))
}

export function filterMediaRowsByQuery<T extends {name?: string | null; path?: string | null}>(
  rows: T[],
  query: string,
  limit: number,
): T[] {
  const normalized = String(query || '').trim().toLowerCase()
  if (!normalized) return []
  return rows
    .filter((row) => {
      const hay = `${row.name || ''} ${row.path || ''}`.toLowerCase()
      return hay.includes(normalized)
    })
    .slice(0, limit)
}

export function filterTagRowsByQuery<T extends {name?: string | null}>(
  rows: T[],
  query: string,
  limit: number,
): T[] {
  const normalized = String(query || '').trim().toLowerCase()
  return rows
    .filter((row) => !normalized || String(row.name || '').toLowerCase().includes(normalized))
    .slice(0, limit)
}
