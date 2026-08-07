import cols from '../../app/configs/filter-cols'
import {buildLocalFilterAssistSuggestion} from '@shared/localAiAssistFilterGoal'
import type {FilterObject} from '@shared/entities/filter'
import type {MediaItem} from '@/types/stores'
import {typedApi} from '@/services/typedApi'
import {getFilterObject} from '@/services/formatUtils'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useSettingsStore} from '@/stores/settings'
import {getDefaultMediaTypeId, isVideoMediaType} from '@/utils/mediaType'
import {reloadPlaylistsCatalog} from '@/composable/appCatalogs'

export type NlMixSource =
  | 'filters'
  | 'semantic'
  | 'hybrid'
  | 'filters_fallback'
  | 'semantic_fallback'

export type NlMixFilterRow = {
  param: string | number
  type: string
  cond: string
  val: unknown
  active?: boolean
}

export type NlPlaylistMixResult = {
  phrase: string
  ids: number[]
  videos: MediaItem[]
  filters: FilterObject[]
  explanation: string
  source: NlMixSource
  residual: string
  clipQuery: string
  hitTimes: Map<number, number>
}

const DEFAULT_LIMIT = 200

/** Pure merge of filter IDs + CLIP-ranked IDs. */
export function mergeNlPlaylistIds(options: {
  filterIds: number[]
  clipIds: number[]
}): {ids: number[]; source: NlMixSource} {
  const filterIds = uniquePositiveIds(options.filterIds)
  const clipIds = uniquePositiveIds(options.clipIds)
  const hasFilters = filterIds.length > 0
  const hasClip = clipIds.length > 0

  if (hasFilters && hasClip) {
    const allowed = new Set(filterIds)
    const intersected = clipIds.filter((id) => allowed.has(id))
    if (intersected.length) {
      return {ids: intersected, source: 'hybrid'}
    }
    return {ids: filterIds, source: 'filters_fallback'}
  }

  if (hasFilters) return {ids: filterIds, source: 'filters'}
  if (hasClip) return {ids: clipIds, source: 'semantic'}
  return {ids: [], source: 'filters'}
}

export function uniquePositiveIds(ids: Array<number | string | null | undefined>): number[] {
  const seen = new Set<number>()
  const out: number[] = []
  for (const raw of ids) {
    const id = Number(raw)
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export function goalRowsToFilterObjects(rows: NlMixFilterRow[]): FilterObject[] {
  return rows.map((row, index) => getFilterObject({
    param: row.param,
    type: row.type ?? null,
    cond: row.cond ?? null,
    val: row.val,
    active: row.active !== false,
    order: index,
  }))
}

/** Build filter-assist context for video library mixes (no Filters.vue required). */
export function buildNlMixAssistContext(goal: string): Record<string, unknown> {
  const appStore = useAppStore()
  const itemsStore = useItemsStore()
  const today = new Date().toISOString().slice(0, 10)

  const availableFields: Array<{param: string | number; type?: string; name?: string}> = []
  const pushCols = (items: Array<{param?: string | number; type?: string; text?: string}> = []) => {
    for (const item of items) {
      if (item.param == null) continue
      availableFields.push({
        param: item.param,
        type: item.type,
        name: item.text,
      })
    }
  }

  pushCols(cols.media || [])
  pushCols(cols.video || [])
  pushCols(cols.standart || [])

  const assigned = Array.isArray(itemsStore.assigned) ? itemsStore.assigned : []
  for (const entry of assigned) {
    const meta = entry?.meta
    if (!meta?.id) continue
    availableFields.push({
      param: meta.id,
      type: meta.type || 'array',
      name: meta.name || undefined,
    })
  }

  for (const meta of appStore.meta || []) {
    if (meta?.type !== 'array' || meta.id == null) continue
    if (availableFields.some((field) => Number(field.param) === Number(meta.id))) continue
    availableFields.push({
      param: meta.id,
      type: 'array',
      name: meta.name || undefined,
    })
  }

  return {
    goal,
    pageType: 'media',
    mediaKind: 'video',
    today,
    availableFields,
    currentFilters: [],
  }
}

function clipUsable(modelStatus: string | undefined, indexedCount: number): boolean {
  const status = String(modelStatus || '').toLowerCase()
  if (['error', 'missing', 'unknown', ''].includes(status) && indexedCount <= 0) return false
  if (status === 'error') return false
  return indexedCount > 0 || ['downloaded', 'loaded', 'ready'].includes(status)
}

export async function resolveNlPlaylistMix(
  phrase: string,
  options: {
    mediaTypeId?: number | null
    limit?: number
    signal?: AbortSignal
    skipClip?: boolean
  } = {},
): Promise<NlPlaylistMixResult> {
  const trimmed = String(phrase || '').trim()
  const limit = Math.max(1, Math.min(Number(options.limit) || DEFAULT_LIMIT, 500))
  const appStore = useAppStore()
  const settingsStore = useSettingsStore()
  const mediaTypeId = options.mediaTypeId ?? getDefaultMediaTypeId(appStore.mediaTypes)

  const empty: NlPlaylistMixResult = {
    phrase: trimmed,
    ids: [],
    videos: [],
    filters: [],
    explanation: '',
    source: 'filters',
    residual: '',
    clipQuery: trimmed,
    hitTimes: new Map(),
  }

  if (!trimmed) return empty
  if (options.signal?.aborted) return empty

  const context = buildNlMixAssistContext(trimmed)
  const local = buildLocalFilterAssistSuggestion(context, {allowPartial: true})
  const goalFilters = Array.isArray(local?.filters) ? (local!.filters as NlMixFilterRow[]) : []
  const filters = goalRowsToFilterObjects(goalFilters)
  const residual = String(local?.residual || '').trim()
  const explanation = String(local?.explanation || '').trim()
  const clipQuery = residual || trimmed

  let filterIds: number[] = []
  if (filters.length) {
    const idsRes = await typedApi.getMediaIds({
      mediaTypeId,
      filters,
      sortBy: 'id',
      direction: 'desc',
    })
    if (options.signal?.aborted) return empty
    filterIds = uniquePositiveIds(idsRes.data?.ids || []).slice(0, limit)
  }

  let clipIds: number[] = []
  const hitTimes = new Map<number, number>()
  if (!options.skipClip) {
    try {
      const searchRes = await typedApi.semanticSearch({
        query: clipQuery,
        mediaTypeId,
        limit,
        locale: settingsStore.locale || 'en',
      })
      if (options.signal?.aborted) return empty
      if (!searchRes.data?.error) {
        const indexedCount = Number(searchRes.data?.indexedCount || 0)
        if (clipUsable(searchRes.data?.modelStatus, indexedCount)) {
          clipIds = uniquePositiveIds(searchRes.data?.ids || [])
          for (const hit of Array.isArray(searchRes.data?.hits) ? searchRes.data.hits : []) {
            const id = Number(hit?.id)
            const time = Number(hit?.time)
            if (Number.isFinite(id) && id > 0 && Number.isFinite(time) && time >= 0) {
              hitTimes.set(id, time)
            }
          }
        }
      }
    } catch (error) {
      console.warn('NL mix semantic search failed:', error)
    }
  }

  // Partial-only filters with residual vibe: prefer intersection; if CLIP empty keep filters.
  const merged = mergeNlPlaylistIds({filterIds, clipIds})
  let ids = merged.ids.slice(0, limit)
  let source = merged.source

  // If we only got filters because CLIP failed but residual looked like vibe-only,
  // and filters were empty → already handled. If intersection empty we used filters_fallback.

  if (!ids.length && clipIds.length) {
    ids = clipIds.slice(0, limit)
    source = 'semantic_fallback'
  }

  if (!ids.length) {
    return {
      ...empty,
      filters,
      explanation,
      residual,
      clipQuery,
      source,
    }
  }

  const basicsRes = await typedApi.getMediaBasics({ids})
  if (options.signal?.aborted) return empty

  const basicsById = new Map<number, MediaItem>()
  for (const item of Array.isArray(basicsRes.data?.items) ? basicsRes.data.items : []) {
    const id = Number(item?.id)
    if (Number.isFinite(id) && id > 0) basicsById.set(id, item as MediaItem)
  }

  const videos = ids
    .map((id) => {
      const item = basicsById.get(id)
      if (!item?.path) return null
      const type = appStore.mediaTypes?.find((entry) => entry.id === Number(item.mediaTypeId))
      if (type && !isVideoMediaType(type)) return null
      const time = hitTimes.get(id)
      return {
        ...item,
        ...(time != null ? {segmentStart: time} : {}),
      } as MediaItem
    })
    .filter((item): item is MediaItem => Boolean(item))

  return {
    phrase: trimmed,
    ids: videos.map((item) => Number(item.id)),
    videos,
    filters,
    explanation,
    source,
    residual,
    clipQuery,
    hitTimes,
  }
}

export async function playNlPlaylistMix(
  mix: NlPlaylistMixResult,
): Promise<{played: boolean; seekTime: number}> {
  if (!mix.videos.length) return {played: false, seekTime: 0}
  const itemsStore = useItemsStore()
  const first = mix.videos[0]
  const seekTime = Number(first.segmentStart)
  const hasSeek = Number.isFinite(seekTime) && seekTime > 0
  await itemsStore.playVideo({
    video: first,
    time: hasSeek ? seekTime : 0,
    videos: mix.videos,
    trustPath: true,
  })
  return {played: true, seekTime: hasSeek ? seekTime : 0}
}

export async function saveNlPlaylistMix(
  mix: NlPlaylistMixResult,
  name?: string,
): Promise<{kind: 'smart' | 'static'; id: number; name: string}> {
  const title = String(name || mix.phrase || 'Mix').trim() || 'Mix'
  const appStore = useAppStore()
  const mediaTypeId = getDefaultMediaTypeId(appStore.mediaTypes)

  if (mix.filters.length) {
    const response = await typedApi.createSavedFilter({
      name: title,
      mediaTypeId,
      metaId: null,
      tagId: null,
      tabId: null,
    })
    const data = response.data
    const saved = Array.isArray(data) ? data[0] : data
    const savedId = Number(saved?.id)
    if (!savedId) throw new Error('Failed to create smart playlist')

    for (let index = 0; index < mix.filters.length; index++) {
      const filter = {...mix.filters[index], id: null, order: index}
      await typedApi.createFilterRow({
        filter,
        filterId: savedId,
        rowId: null,
      })
    }

    return {kind: 'smart', id: savedId, name: String(saved?.name || title)}
  }

  const playlistRes = await typedApi.createPlaylist({name: title})
  const playlistId = Number(playlistRes.data?.id)
  if (!playlistId) throw new Error('Failed to create playlist')

  for (const mediaId of mix.ids) {
    await typedApi.addMediaToPlaylist({mediaId, playlistId})
  }
  void reloadPlaylistsCatalog()

  return {
    kind: 'static',
    id: playlistId,
    name: String(playlistRes.data?.name || title),
  }
}
