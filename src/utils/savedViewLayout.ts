import {serializeGroupBySetting, parseGroupBySetting} from '@shared/itemsGroupBy'
import type {ItemsGroupBy} from '@shared/itemsGroupBy'

export type FiltersJoinMode = 'and' | 'or'

export type SavedViewLayout = {
  sortBy?: string | null
  sortDir?: string | null
  size?: number | null
  view?: number | string | null
  /** Serialized group-by setting (e.g. `none`, `rating`, `pinnedMeta:3`). */
  groupBy?: string | null
  /** How filter rows combine when the view is applied. */
  filtersJoin?: FiltersJoinMode | null
}

type ItemsLike = {
  sortBy?: unknown
  sortDir?: unknown
  size?: unknown
  view?: unknown
  groupBy?: unknown
  groupByMetaId?: unknown
  filtersJoin?: unknown
}

function optionalString(value: unknown): string | null {
  if (value == null) return null
  const text = String(value).trim()
  return text || null
}

function optionalNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function normalizeFiltersJoinMode(value: unknown): FiltersJoinMode {
  return value === 'or' ? 'or' : 'and'
}

/** Snapshot current list layout for a saved view. */
export function captureSavedViewLayout(items: ItemsLike): SavedViewLayout {
  const groupBy = String(items.groupBy || 'none') as ItemsGroupBy
  const metaId = optionalNumber(items.groupByMetaId)
  return {
    sortBy: optionalString(items.sortBy),
    sortDir: optionalString(items.sortDir),
    size: optionalNumber(items.size),
    view: items.view == null ? null : items.view as number | string,
    groupBy: serializeGroupBySetting(groupBy, metaId),
    filtersJoin: normalizeFiltersJoinMode(items.filtersJoin),
  }
}

export function pickSavedViewLayout(source: Record<string, unknown> | null | undefined): SavedViewLayout {
  if (!source || typeof source !== 'object') return {}
  return {
    sortBy: optionalString(source.sortBy),
    sortDir: optionalString(source.sortDir),
    size: optionalNumber(source.size),
    view: source.view == null ? null : source.view as number | string,
    groupBy: optionalString(source.groupBy),
    filtersJoin: normalizeFiltersJoinMode(source.filtersJoin),
  }
}

export function hasSavedViewLayout(layout: SavedViewLayout | null | undefined): boolean {
  if (!layout) return false
  return Boolean(
    layout.sortBy
    || layout.sortDir
    || layout.size != null
    || layout.view != null
    || (layout.groupBy && layout.groupBy !== 'none')
    || layout.filtersJoin === 'or'
    || layout.filtersJoin === 'and',
  )
}

export function describeSavedViewLayout(
  layout: SavedViewLayout,
  labels: {
    size?: (size: number) => string
    sort?: (sortBy: string, sortDir: string | null) => string
    group?: (groupBy: string) => string
    view?: (view: number | string) => string
    join?: (filtersJoin: FiltersJoinMode) => string
  } = {},
): string[] {
  const parts: string[] = []
  if (layout.size != null && labels.size) {
    parts.push(labels.size(Number(layout.size)))
  } else if (layout.size != null) {
    parts.push(`size ${layout.size}`)
  }
  if (layout.sortBy) {
    parts.push(
      labels.sort
        ? labels.sort(layout.sortBy, layout.sortDir ?? null)
        : `${layout.sortBy}${layout.sortDir ? ` ${layout.sortDir}` : ''}`,
    )
  }
  if (layout.groupBy && layout.groupBy !== 'none') {
    parts.push(labels.group ? labels.group(layout.groupBy) : layout.groupBy)
  }
  if (layout.filtersJoin === 'or') {
    parts.push(labels.join ? labels.join('or') : 'OR')
  }
  if (layout.view != null && labels.view) {
    parts.push(labels.view(layout.view))
  }
  return parts
}

export function parseSavedViewGroupBy(layout: SavedViewLayout): {
  groupBy: ItemsGroupBy
  groupByMetaId: number | null
  firstChar: string
} {
  const parsed = parseGroupBySetting(layout.groupBy || 'none')
  return {
    groupBy: parsed.groupBy,
    groupByMetaId: parsed.groupBy === 'pinnedMeta' ? parsed.metaId : null,
    firstChar: serializeGroupBySetting(parsed.groupBy, parsed.metaId),
  }
}
