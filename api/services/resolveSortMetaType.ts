import type { ApiDb } from '../types/db'
import { createMetaRepository } from '../db/repositories/meta'
import { isSortableMetaType } from '../utils/metaValueSort'
import { resolveMetaId } from '../utils/metaId'

export function resolveSortMetaType(db: ApiDb, sortBy: string): string | null {
  const metaId = resolveMetaId(sortBy)
  if (metaId === null) return null

  const metaRepo = createMetaRepository(db.drizzle)
  const row = metaRepo.findById(metaId)
  const type = row?.type ?? null
  return isSortableMetaType(type) ? type : null
}
