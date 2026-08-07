import type { ApiDb } from '../types/db'
import type { Meta } from '@shared/entities/meta'
import type {
  MarkLike,
  MarkLoadOptions,
} from '../types/markItems'
import { createMarksRepository } from '../db/repositories/marks'
import { createMetaRepository } from '../db/repositories/meta'
import { normalizeMark } from './markItemsFilter'
import { countMarksFiltered, queryMarkPageIds } from './markItemsSql'

async function getMarkFilterMetas(db: ApiDb): Promise<Meta[]> {
  const metaRepo = createMetaRepository(db.drizzle)
  return metaRepo.findMarkFilters() as unknown as Meta[]
}

async function loadMarkItems(db: ApiDb, options: MarkLoadOptions = {}) {
  const marksRepo = createMarksRepository(db.drizzle)
  const {
    types = [],
    sortBy = 'time',
    sortDir = 'desc',
    page = 1,
    limit = 24,
    search = '',
    clipsOnly = false,
  } = options

  const safePage = Math.max(1, Number(page) || 1)
  const safeLimit = Math.max(1, Math.min(Number(limit) || 24, 100))
  const offset = (safePage - 1) * safeLimit

  const listOptions = {
    types,
    search,
    sortBy,
    sortDir,
    limit: safeLimit,
    offset,
    clipsOnly: Boolean(clipsOnly),
  }

  const total = marksRepo.countAll()
  const totalFiltered = countMarksFiltered(db, listOptions)
  const pageIds = totalFiltered > 0
    ? queryMarkPageIds(db, listOptions)
    : []
  const pageItems = marksRepo.findByIdsWithRelations(pageIds)
    .map((mark) => normalizeMark(mark as MarkLike))

  return {
    items: pageItems,
    total,
    totalFiltered,
    page: safePage,
    limit: safeLimit,
  }
}

export {
  getMarkFilterMetas,
  loadMarkItems,
}
