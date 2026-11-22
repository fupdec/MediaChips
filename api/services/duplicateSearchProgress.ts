import type {DuplicateSearchProgress} from '../../shared/api/responses'

const EXPIRE_MS = 10 * 60_000
const entries = new Map<string, DuplicateSearchProgress & {touchedAt: number}>()

function sweep(now: number) {
  for (const [id, entry] of entries) if (now - entry.touchedAt > EXPIRE_MS) entries.delete(id)
}

/** In-memory progress of running duplicate searches, keyed by an id the client picked. */
export function reportDuplicateSearchProgress(id: string | undefined, progress: Omit<DuplicateSearchProgress, 'startedAt' | 'updatedAt'>) {
  if (!id) return
  const now = Date.now()
  sweep(now)
  const previous = entries.get(id)
  entries.set(id, {...progress, startedAt: previous?.startedAt ?? now, updatedAt: now, touchedAt: now})
}

export function readDuplicateSearchProgress(id: string): DuplicateSearchProgress | null {
  const entry = entries.get(id)
  if (!entry) return null
  const {touchedAt: _touchedAt, ...progress} = entry
  return progress
}

export function clearDuplicateSearchProgress(id: string | undefined) {
  if (id) entries.delete(id)
}
