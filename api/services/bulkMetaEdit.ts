import type { ApiDb } from '../types/db'
import type {
  BulkItemId,
  BulkItemType,
  BulkMetaEditOptions,
  BulkMetaEditResult,
  PresetEditChange,
} from '../types/bulkMetaEdit'

import { createMediaRepository } from '../db/repositories/media'
import { createTagsRepository } from '../db/repositories/tags'
import { createTagsInMediaRepository } from '../db/repositories/tagsInMedia'
import { createTagsInTagRepository } from '../db/repositories/tagsInTag'
import { createValuesInMediaRepository } from '../db/repositories/valuesInMedia'
import { createValuesInTagRepository } from '../db/repositories/valuesInTag'

const BATCH_SIZE = 200

function chunkArray<T>(items: T[], size: number = BATCH_SIZE): T[][] {
  const chunks = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

type MediaTagLinkRow = { mediaId: number; metaId: number; tagId: number }
type TagTagLinkRow = { parentTagId: number; metaId: number; tagId: number }

function buildTagRows(
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

function buildMediaValueRows(itemIds: number[], metaId: number, value: unknown) {
  return itemIds.map((itemId) => ({
    mediaId: itemId,
    metaId,
    value: String(value ?? ''),
  }))
}

function buildTagValueRows(itemIds: number[], metaId: number, value: unknown) {
  return itemIds.map((itemId) => ({
    tagId: itemId,
    metaId,
    value: String(value ?? ''),
  }))
}

const PRESET_FIELDS = new Set(['rating', 'favorite', 'views'])

function normalizePresetValue(field: string, editType: number, value: unknown) {
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

async function applyPresetBulkEdit(
  db: ApiDb,
  itemType: BulkItemType,
  itemIds: number[],
  presetChanges: PresetEditChange[] = [],
) {
  const mediaRepo = createMediaRepository(db.drizzle)
  const tagsRepo = createTagsRepository(db.drizzle, db.sqlite)
  let appliedChanges = 0

  for (const change of presetChanges) {
    const editType = Number(change.editType)
    if (!editType || editType === 3) continue

    const field = String(change.field || '')
    if (!PRESET_FIELDS.has(field)) continue

    const value = normalizePresetValue(field, editType, change.value)
    const updatePayload = {[field]: value}

    for (const batch of chunkArray(itemIds)) {
      if (itemType === 'media') {
        mediaRepo.updateByIds(batch, updatePayload)
      } else {
        tagsRepo.updateByIds(batch, updatePayload)
      }
    }

    appliedChanges += 1
  }

  return appliedChanges
}

async function applyBulkMetaEdit(db: ApiDb, options: BulkMetaEditOptions): Promise<BulkMetaEditResult> {
  const {itemType, itemIds = [], changes = [], presetChanges = []} = options

  const uniqueItemIds = [...new Set(itemIds.filter(Boolean).map((id) => Number(id)))]
  if (!uniqueItemIds.length) {
    return {updated: 0, changes: 0}
  }

  const tagsInMediaRepo = createTagsInMediaRepository(db.drizzle)
  const tagsInTagRepo = createTagsInTagRepository(db.drizzle)
  const valuesInMediaRepo = createValuesInMediaRepository(db.drizzle)
  const valuesInTagRepo = createValuesInTagRepository(db.drizzle)

  let appliedChanges = 0

  for (const change of changes) {
    const editType = Number(change.editType)
    if (!editType) continue

    const metaId = Number(change.metaId)
    const metaType = change.metaType
    const value = change.value

    for (const batch of chunkArray(uniqueItemIds)) {
      if (editType === 1 || editType === 2) {
        if (metaType === 'array') {
          if (itemType === 'media') {
            tagsInMediaRepo.deleteByMediaIdsAndMeta(batch, metaId)
          } else {
            tagsInTagRepo.deleteByParentTagIdsAndMeta(batch, metaId)
          }
        } else if (itemType === 'media') {
          valuesInMediaRepo.deleteByMediaIdsAndMeta(batch, metaId)
        } else {
          valuesInTagRepo.deleteByTagIdsAndMeta(batch, metaId)
        }
      }
    }

    if (editType === 2) {
      if (metaType === 'array') {
        const tagIds = Array.isArray(value) ? value : []
        const rows = buildTagRows(itemType, uniqueItemIds, metaId, tagIds)

        for (const batch of chunkArray(rows, 500)) {
          if (batch.length) {
            if (itemType === 'media') {
              tagsInMediaRepo.bulkCreate(batch as unknown as MediaTagLinkRow[])
            } else {
              tagsInTagRepo.bulkCreate(batch as unknown as TagTagLinkRow[])
            }
          }
        }
      } else if (itemType === 'media') {
        const rows = buildMediaValueRows(uniqueItemIds, metaId, value)

        for (const batch of chunkArray(rows, 500)) {
          if (batch.length) {
            valuesInMediaRepo.bulkCreate(batch)
          }
        }
      } else {
        const rows = buildTagValueRows(uniqueItemIds, metaId, value)

        for (const batch of chunkArray(rows, 500)) {
          if (batch.length) {
            valuesInTagRepo.bulkCreate(batch)
          }
        }
      }
    } else if (editType === 3 && metaType === 'array') {
      const tagIds = Array.isArray(value) ? value : []
      const rows = buildTagRows(itemType, uniqueItemIds, metaId, tagIds)

      for (const batch of chunkArray(rows, 500)) {
        if (batch.length) {
          if (itemType === 'media') {
            tagsInMediaRepo.bulkCreate(batch as unknown as MediaTagLinkRow[])
          } else {
            tagsInTagRepo.bulkCreate(batch as unknown as TagTagLinkRow[])
          }
        }
      }
    }

    appliedChanges += 1
  }

  const presetApplied = await applyPresetBulkEdit(
    db,
    itemType,
    uniqueItemIds,
    presetChanges,
  )

  return {
    updated: uniqueItemIds.length,
    changes: appliedChanges + presetApplied,
  }
}

export {
  applyBulkMetaEdit,
}
