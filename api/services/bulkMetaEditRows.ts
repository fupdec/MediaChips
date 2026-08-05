import type {BulkItemId, BulkItemType} from '../types/bulkMetaEdit'

export const PRESET_FIELDS = new Set(['rating', 'favorite', 'views'])

export function buildTagRows(
  itemType: BulkItemType,
  itemIds: number[],
  metaId: number,
  tagIds: BulkItemId[],
) {
  const rows = []

  for (const itemId of itemIds) {
    for (const tagId of tagIds) {
      if (itemType === 'media') {
        rows.push({mediaId: itemId, metaId, tagId: Number(tagId)})
      } else {
        rows.push({parentTagId: itemId, metaId, tagId: Number(tagId)})
      }
    }
  }

  return rows
}

export function buildMediaValueRows(itemIds: number[], metaId: number, value: unknown) {
  return itemIds.map((itemId) => ({
    mediaId: itemId,
    metaId,
    value: String(value ?? ''),
  }))
}

export function buildTagValueRows(itemIds: number[], metaId: number, value: unknown) {
  return itemIds.map((itemId) => ({
    tagId: itemId,
    metaId,
    value: String(value ?? ''),
  }))
}

export function normalizePresetValue(field: string, editType: number, value: unknown) {
  if (editType === 1) {
    if (field === 'favorite') return false
    return 0
  }

  if (field === 'favorite') {
    return value === true || value === 1 || value === '1'
  }

  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}
