import type { ApiDb } from '../types/db'
import type { Meta } from '@shared/entities/meta'
import type {
  MarkLike,
  MarkLoadOptions,
} from '../types/markItems'
import { createMarksRepository } from '../db/repositories/marks'
import { createMetaRepository } from '../db/repositories/meta'
import shuffle from 'lodash/shuffle'
import {
  matchesMarkSearch,
  matchesMarkTypeFilter,
  normalizeMark,
  sortMarksList,
} from './markItemsFilter'

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
  } = options

  const marks = marksRepo.findAllWithRelations()

  const allItems = marks.map((mark) => normalizeMark(mark as MarkLike))
  const filtered = allItems.filter((mark: MarkLike) => (
    matchesMarkTypeFilter(mark, types) && matchesMarkSearch(mark, search)
  ))
  const sorted = sortMarksList(filtered, sortBy, sortDir, shuffle)

  const safePage = Math.max(1, Number(page) || 1)
  const safeLimit = Math.max(1, Math.min(Number(limit) || 24, 100))
  const offset = (safePage - 1) * safeLimit
  const pageItems = sorted.slice(offset, offset + safeLimit)

  return {
    items: pageItems,
    total: allItems.length,
    totalFiltered: sorted.length,
    page: safePage,
    limit: safeLimit,
  }
}

export {
  getMarkFilterMetas,
  loadMarkItems,
}
