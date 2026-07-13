import type { ApiDb } from '../types/db'
import type { Meta } from '@shared/entities/meta'
import type {
  MarkLike,
  MarkLoadOptions,
  MarkSortKey,
  MarkSortValue,
} from '../types/markItems'
import { createMarksRepository } from '../db/repositories/marks'
import { createMetaRepository } from '../db/repositories/meta'
import shuffle from 'lodash/shuffle'

function normalizeMark(mark: MarkLike): MarkLike {
  const json = {...mark} as MarkLike

  if (json.media && !json.medium) {
    json.medium = json.media
  }

  return json
}

function matchesTypeFilter(mark: MarkLike, types: Array<number | string>) {
  if (!types.length) return false

  if (mark.type === 'favorite' && types.includes('favorite')) return true
  if (mark.type === 'bookmark' && types.includes('bookmark')) return true

  if (mark.type === 'meta') {
    const metaId = mark.tag?.metaId
    return types.some((type) => Number(type) === Number(metaId))
  }

  return false
}

function matchesSearch(mark: MarkLike, search: string) {
  if (!search) return true

  const query = search.toLowerCase().trim()
  const fields = [
    mark.text,
    mark.medium?.name,
    mark.medium?.basename,
    mark.tag?.name,
  ]

  return fields.some((value) => value && String(value).toLowerCase().includes(query))
}

function getSortValue(mark: MarkLike, sortBy: MarkSortKey | string): MarkSortValue {
  switch (sortBy) {
    case 'videoName':
      return (mark.medium?.name || mark.medium?.basename || '').toLowerCase()
    case 'type':
      return mark.type || ''
    case 'tagName':
      return (mark.tag?.name || '').toLowerCase()
    case 'id':
      return Number(mark.id) || 0
    case 'time':
    default:
      return Number(mark.time) || 0
  }
}

function sortMarks(
  items: MarkLike[],
  sortBy: MarkSortKey | string = 'time',
  sortDir: 'asc' | 'desc' | string = 'desc',
): MarkLike[] {
  if (sortBy === 'shuffle') {
    return shuffle(items)
  }

  const direction = sortDir === 'asc' ? 1 : -1

  return [...items].sort((a, b) => {
    const aVal = getSortValue(a, sortBy)
    const bVal = getSortValue(b, sortBy)

    if (typeof aVal === 'string' || typeof bVal === 'string') {
      return String(aVal).localeCompare(String(bVal), undefined, {sensitivity: 'base'}) * direction
    }

    if (aVal === bVal) return (Number(a.id) || 0) - (Number(b.id) || 0)
    return (aVal < bVal ? -1 : 1) * direction
  })
}

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
    matchesTypeFilter(mark, types) && matchesSearch(mark, search)
  ))
  const sorted = sortMarks(filtered, sortBy, sortDir)

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
    pages: Math.max(1, Math.ceil(sorted.length / safeLimit)),
  }
}

export { getMarkFilterMetas, loadMarkItems }
