import type { ParsedItem } from '../../app/types/items'

export const SORTABLE_META_TYPES = new Set([
  'number',
  'rating',
  'date',
  'string',
  'boolean',
])

export function isSortableMetaType(type: string | null | undefined): boolean {
  return Boolean(type && SORTABLE_META_TYPES.has(type))
}

function isTruthyMetaValue(value: unknown): boolean {
  return value === '1' || value === 1 || value === true || value === 'true' || value === 'TRUE'
}

export function buildMetaValueSortSql(valueColumn: string, metaType: string): string {
  if (metaType === 'number' || metaType === 'rating') {
    return `CAST(COALESCE(${valueColumn}, '0') AS REAL)`
  }

  if (metaType === 'boolean') {
    return `CASE WHEN COALESCE(${valueColumn}, '') IN ('1', 1, 'true', 'TRUE') THEN 1 ELSE 0 END`
  }

  return `COALESCE(${valueColumn}, '')`
}

export function buildMediaMetaSortExpression(metaId: number, metaType: string): string {
  const valueColumn = `(SELECT vim.value FROM valuesInMedia vim WHERE vim.mediaId = media.id AND vim.metaId = ${metaId} LIMIT 1)`
  return buildMetaValueSortSql(valueColumn, metaType)
}

export function buildTagMetaSortExpression(metaId: number, metaType: string): string {
  const valueColumn = `(SELECT vit.value FROM valuesInTags vit WHERE vit.tagId = tags.id AND vit.metaId = ${metaId} LIMIT 1)`
  return buildMetaValueSortSql(valueColumn, metaType)
}

export function getItemMetaSortValue(
  item: ParsedItem,
  metaId: number,
  metaType: string,
): string | number {
  const found = item.values?.find((entry) => Number(entry.metaId) === metaId)
  const raw = found?.value

  if (metaType === 'number' || metaType === 'rating') {
    const num = Number(raw)
    return Number.isFinite(num) ? num : 0
  }

  if (metaType === 'boolean') {
    return isTruthyMetaValue(raw) ? 1 : 0
  }

  if (metaType === 'date') {
    return raw ?? ''
  }

  return raw ?? ''
}

export function getItemSortIteratee(
  sortBy: string,
  sortMetaType?: string | null,
): string | ((item: ParsedItem) => string | number) {
  if (sortMetaType) {
    const metaId = Number(sortBy)
    if (Number.isFinite(metaId) && Number.isInteger(metaId)) {
      return (item: ParsedItem) => getItemMetaSortValue(item, metaId, sortMetaType)
    }
  }

  return sortBy
}
