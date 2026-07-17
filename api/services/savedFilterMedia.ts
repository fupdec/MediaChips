import type { ApiDb, FilterLike } from '../types/db'
import type {
  SavedFilterBasic,
  SavedFilterId,
  SavedFilterMediaOptions,
  TagsByRowIdMap,
} from '../types/savedFilterMedia'
import type { MediaId } from '../types/mediaFilter'
import type { ParsedDynamicPlaylistSummary } from '@shared/schemas/filters'
import type { SavedFilterMediaResponse, SavedFilterSummaryResponse } from '@shared/api/responses'
import type { MediaItem } from '@shared/entities/media'
import { parseCountries } from '../utils/country'
import { normalizeMetaIdParam } from '../utils/metaId'
import { parseExtList } from '../utils/ext'
import {
  getCachedDynamicPlaylistsSummary,
  setCachedDynamicPlaylistsSummary,
} from './dynamicPlaylistsSummaryCache'
import {
  loadFilteredMediaIds,
  loadMediaPlaylistItems,
  getFilteredMediaSummary,
} from './mediaItemsLoader'
import { createSavedFiltersRepository } from '../db/repositories/savedFilters'
import { createFilterRowsInSavedFiltersRepository } from '../db/repositories/filterRowsInSavedFilters'
import { createFilterRowsRepository } from '../db/repositories/filterRows'
import { createTagsInFilterRowsRepository } from '../db/repositories/tagsInFilterRows'
import { createMediaTypesRepository } from '../db/repositories/mediaTypes'

function normalizeFilterRow(row: FilterLike, tagsByRowId: TagsByRowIdMap | null = null): FilterLike {
  const normalized: FilterLike = {...row}

  if (normalized.param != null) {
    normalized.param = normalizeMetaIdParam(normalized.param) as FilterLike['param']
  }

  if (normalized.type === 'number' || normalized.type === 'rating') {
    if (normalized.val !== null && normalized.val !== undefined && normalized.val !== '') {
      normalized.val = Number(normalized.val)
    }
  }

  if (typeof normalized.active !== 'undefined') {
    normalized.active = normalized.active === true || normalized.active === 1 || normalized.active === '1'
  }

  if (normalized.type === 'array' && normalized.param !== 'country' && normalized.param !== 'ext') {
    const tags = tagsByRowId?.get(Number(normalized.id)) || []
    normalized.val = tags.map((tag) => tag.tagId)
  } else if (normalized.param === 'country' && normalized.val) {
    normalized.val = parseCountries(String(normalized.val))
  } else if (normalized.param === 'ext' && normalized.val) {
    normalized.val = parseExtList(normalized.val as string | string[] | null | undefined)
  }

  const { ...cleaned } = normalized
  return cleaned
}

async function loadSavedFilterRows(db: ApiDb, savedFilterId: SavedFilterId): Promise<FilterLike[]> {
  const filtersMap = await loadSavedFilterRowsBatch(db, [savedFilterId])
  return filtersMap.get(Number(savedFilterId)) || []
}

async function loadSavedFilterRowsBatch(db: ApiDb, savedFilterIds: SavedFilterId[]) {
  const filterRowsInSavedFiltersRepo = createFilterRowsInSavedFiltersRepository(db.drizzle)
  const filterRowsRepo = createFilterRowsRepository(db.drizzle)
  const tagsInFilterRowsRepo = createTagsInFilterRowsRepository(db.drizzle)

  const filtersBySavedFilterId = new Map<number, FilterLike[]>(
    savedFilterIds.map((id: SavedFilterId) => [Number(id), []]),
  )
  if (!savedFilterIds.length) return filtersBySavedFilterId

  const links = filterRowsInSavedFiltersRepo.findByFilterIds(savedFilterIds.map((id) => Number(id)))

  const rowIds = [...new Set(links.map((link) => Number(link.rowId)))]
  const filterRows = filterRowsRepo.findByIds(rowIds)
  const filterRowsById = new Map(filterRows.map((row) => [Number(row.id), row]))

  const linkEntries: Array<{ filterId: SavedFilterId; filterRow: FilterLike }> = []

  for (const link of links) {
    const filterRow = filterRowsById.get(Number(link.rowId))
    if (!filterRow) continue

    linkEntries.push({
      filterId: link.filterId as SavedFilterId,
      filterRow: filterRow as FilterLike,
    })
  }

  const tagRows = tagsInFilterRowsRepo.findByRowIds(rowIds)

  const tagsByRowId: TagsByRowIdMap = new Map()
  for (const tag of tagRows) {
    const rowId = Number(tag.rowId)
    if (!tagsByRowId.has(rowId)) tagsByRowId.set(rowId, [])
    tagsByRowId.get(rowId)!.push({
      rowId: tag.rowId as number | string,
      tagId: tag.tagId as number | string,
    })
  }

  for (const {filterId, filterRow} of linkEntries) {
    const cleaned = normalizeFilterRow(filterRow, tagsByRowId)
    filtersBySavedFilterId.get(Number(filterId))?.push(cleaned)
  }

  for (const rows of filtersBySavedFilterId.values()) {
    rows.sort((a, b) => {
      const orderA = Number(a.order ?? 0)
      const orderB = Number(b.order ?? 0)
      if (orderA !== orderB) return orderA - orderB
      return Number(a.id ?? 0) - Number(b.id ?? 0)
    })
  }

  return filtersBySavedFilterId
}

async function getVideoMediaTypeId(db: ApiDb) {
  const mediaTypesRepo = createMediaTypesRepository(db.drizzle)
  const videoType = mediaTypesRepo.findByType('video')
  return videoType?.id || null
}

async function getFilteredMediaForSavedFilter(
  db: ApiDb,
  savedFilterId: SavedFilterId,
  options: SavedFilterMediaOptions = {},
): Promise<SavedFilterMediaResponse & { previewIds?: number[] }> {
  const {
    mediaTypeId = await getVideoMediaTypeId(db),
    sortBy = 'id',
    direction = 'desc',
    previewLimit = null,
  } = options

  if (!mediaTypeId) {
    return {items: [], count: 0, previewIds: []}
  }

  const filters = await loadSavedFilterRows(db, savedFilterId)
  const idsResult = await loadFilteredMediaIds(db, {
    mediaTypeId,
    filters,
    sortBy,
    direction,
    find_duplicates: false,
    duplicates_by: 'filesize',
  })

  const targetIds = (previewLimit
    ? idsResult.ids.slice(0, previewLimit)
    : idsResult.ids) as MediaId[]

  const items = await loadMediaPlaylistItems(db, targetIds)

  return {
    items: items as MediaItem[],
    count: idsResult.totalFiltered,
    previewIds: idsResult.ids.slice(0, 4).map((id) => Number(id)),
  }
}

async function getSavedFilterPlaylistSummary(
  db: ApiDb,
  savedFilterId: SavedFilterId,
  options: SavedFilterMediaOptions = {},
): Promise<SavedFilterSummaryResponse> {
  const {
    mediaTypeId = await getVideoMediaTypeId(db),
    sortBy = 'id',
    direction = 'desc',
    previewLimit = 4,
  } = options

  if (!mediaTypeId) {
    return {count: 0, previewIds: []}
  }

  const filters = await loadSavedFilterRows(db, savedFilterId)

  return getFilteredMediaSummary(db, {
    mediaTypeId,
    filters,
    sortBy,
    direction,
    previewLimit: previewLimit ?? undefined,
    find_duplicates: false,
    duplicates_by: 'filesize',
  }) as Promise<SavedFilterSummaryResponse>
}

async function getSavedFiltersHydrated(db: ApiDb, filters: Record<string, unknown> = {}) {
  const savedFiltersRepo = createSavedFiltersRepository(db.drizzle)
  const rows = savedFiltersRepo.findAllNamed(filters)
  if (!rows.length) return []

  const filtersBySavedFilterId = await loadSavedFilterRowsBatch(
    db,
    rows.map((savedFilter) => savedFilter.id as SavedFilterId),
  )

  return rows.map((savedFilter) => ({
    ...savedFilter,
    filters: filtersBySavedFilterId.get(Number(savedFilter.id)) || [],
  }))
}

async function findOrCreateSavedFilterHydrated(
  db: ApiDb,
  payload: {
    name?: string | null
    mediaTypeId?: number | null
    metaId?: number | null
    tagId?: number | null
    tabId?: number | null
  } = {},
) {
  const savedFiltersRepo = createSavedFiltersRepository(db.drizzle)
  const { row, created } = payload.name
    ? { row: savedFiltersRepo.create(payload), created: true }
    : savedFiltersRepo.findOrCreate(payload)

  const filtersBySavedFilterId = await loadSavedFilterRowsBatch(db, [row.id as SavedFilterId])

  return {
    savedFilter: {
      ...row,
      filters: filtersBySavedFilterId.get(Number(row.id)) || [],
    },
    created,
  }
}

async function getDynamicPlaylistsBasic(db: ApiDb): Promise<SavedFilterBasic[]> {
  const savedFiltersRepo = createSavedFiltersRepository(db.drizzle)
  const mediaTypeId = await getVideoMediaTypeId(db)
  if (!mediaTypeId) return []

  return savedFiltersRepo.findDynamicPlaylists(mediaTypeId).map((savedFilter: {id: number; name: string | null}) => ({
    id: savedFilter.id as SavedFilterId,
    name: savedFilter.name,
  }))
}

async function getDynamicPlaylistsSummary(db: ApiDb): Promise<ParsedDynamicPlaylistSummary[]> {
  const savedFiltersRepo = createSavedFiltersRepository(db.drizzle)
  const mediaTypeId = await getVideoMediaTypeId(db)
  if (!mediaTypeId) return []

  const cached = getCachedDynamicPlaylistsSummary(Number(mediaTypeId))
  if (cached) return cached as ParsedDynamicPlaylistSummary[]

  const savedFilters = savedFiltersRepo.findDynamicPlaylistsFull(mediaTypeId)

  if (!savedFilters.length) return []

  const filtersBySavedFilterId = await loadSavedFilterRowsBatch(
    db,
    savedFilters.map((savedFilter: {id: number}) => savedFilter.id as SavedFilterId),
  )

  const summaries = await Promise.all(savedFilters.map(async (savedFilter: {id: number; name: string | null}) => {
    const filters = filtersBySavedFilterId.get(Number(savedFilter.id)) || []
    const summary = await getFilteredMediaSummary(db, {
      mediaTypeId,
      filters,
      sortBy: 'id',
      direction: 'desc',
      previewLimit: 4,
      find_duplicates: false,
      duplicates_by: 'filesize',
    })

    return {
      id: savedFilter.id,
      name: savedFilter.name,
      count: Number(summary.count) || 0,
      previewIds: summary.previewIds || [],
    }
  }))

  setCachedDynamicPlaylistsSummary(Number(mediaTypeId), summaries)
  return summaries as unknown as ParsedDynamicPlaylistSummary[]
}

async function getFilteredMediaForPlayback(
  db: ApiDb,
  savedFilterId: SavedFilterId,
  options: SavedFilterMediaOptions = {},
): Promise<SavedFilterMediaResponse> {
  const {
    mediaTypeId = await getVideoMediaTypeId(db),
    sortBy = 'id',
    direction = 'desc',
  } = options

  if (!mediaTypeId) {
    return {items: [], count: 0}
  }

  const filters = await loadSavedFilterRows(db, savedFilterId)
  const idsResult = await loadFilteredMediaIds(db, {
    mediaTypeId,
    filters,
    sortBy,
    direction,
    find_duplicates: false,
    duplicates_by: 'filesize',
  })

  const items = await loadMediaPlaylistItems(db, idsResult.ids as MediaId[])

  return {
    items: items as MediaItem[],
    count: idsResult.totalFiltered,
  }
}

export {
  getDynamicPlaylistsBasic,
  getDynamicPlaylistsSummary,
  getSavedFilterPlaylistSummary,
  getSavedFiltersHydrated,
  findOrCreateSavedFilterHydrated,
  getFilteredMediaForPlayback,
  getFilteredMediaForSavedFilter,
  getVideoMediaTypeId,
  loadSavedFilterRows,
  loadSavedFilterRowsBatch,
}
