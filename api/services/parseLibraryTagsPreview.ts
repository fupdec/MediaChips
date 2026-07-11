import type { ApiDb } from '../types/db'
import type { ParserSettings } from '../types/tasks'
import { createMediaRepository } from '../db/repositories/media'
import { createMetaRepository } from '../db/repositories/meta'
import { createTagsRepository } from '../db/repositories/tags'
import { createTagsInMediaRepository } from '../db/repositories/tagsInMedia'
import {
  buildTagPathIndex,
  extractPathPhrases,
  matchPathToTagsFromPhrasesWithIndex,
} from '../../shared/pathParser/core'

export interface ParseLibraryTagsPreviewTag {
  tagId: number
  metaId: number
  tagName: string
  metaName: string
  isNew: boolean
}

export interface ParseLibraryTagsPreviewItem {
  mediaId: number
  path: string
  tags: ParseLibraryTagsPreviewTag[]
}

export interface ParseLibraryTagsStatus {
  totalMedia: number
  parserMetas: Array<{ id: number; name: string }>
  parserTags: number
}

export interface ParseLibraryTagsSummary {
  totalMedia: number
  mediaWithNewTags: number
  totalNewTags: number
  totalProposedTags: number
  stopped: boolean
}

type PreviewEvent =
  | { type: 'progress'; processed: number; total: number; current?: string }
  | { type: 'item'; item: ParseLibraryTagsPreviewItem }
  | { type: 'complete'; summary: ParseLibraryTagsSummary; items: ParseLibraryTagsPreviewItem[] }
  | { type: 'error'; message: string }

function assignmentKey(mediaId: number, metaId: number, tagId: number) {
  return `${mediaId}:${metaId}:${tagId}`
}

export function getParseLibraryTagsStatus(db: ApiDb): ParseLibraryTagsStatus {
  const mediaRepo = createMediaRepository(db.drizzle)
  const metaRepo = createMetaRepository(db.drizzle)
  const tagsRepo = createTagsRepository(db.drizzle, db.sqlite)

  const parserMetas = metaRepo.findAll()
    .filter((meta) => meta.parser)
    .map((meta) => ({ id: Number(meta.id), name: String(meta.name || '') }))

  const parserMetaIds = parserMetas.map((meta) => meta.id)
  const tags = parserMetaIds.length ? tagsRepo.findByMetaIds(parserMetaIds) : []

  return {
    totalMedia: mediaRepo.countAll(),
    parserMetas,
    parserTags: tags.length,
  }
}

export async function* iterateParseLibraryTagsPreview(
  db: ApiDb,
  options: {
    settings?: ParserSettings
    shouldStop?: () => boolean
  } = {},
): AsyncGenerator<PreviewEvent> {
  const mediaRepo = createMediaRepository(db.drizzle)
  const metaRepo = createMetaRepository(db.drizzle)
  const tagsRepo = createTagsRepository(db.drizzle, db.sqlite)

  const parserMetas = metaRepo.findAll().filter((meta) => meta.parser)
  const parserMetaIds = parserMetas.map((meta) => Number(meta.id))
  if (!parserMetaIds.length) {
    yield {
      type: 'complete',
      summary: {
        totalMedia: 0,
        mediaWithNewTags: 0,
        totalNewTags: 0,
        totalProposedTags: 0,
        stopped: false,
      },
      items: [],
    }
    return
  }

  const metaNameById = new Map(parserMetas.map((meta) => [Number(meta.id), String(meta.name || '')]))
  const tags = tagsRepo.findByMetaIds(parserMetaIds)
  const tagById = new Map(tags.map((tag) => [Number(tag.id), tag]))

  const currentRows = db.sqlite!.prepare(`
    SELECT mediaId, tagId, metaId
    FROM tagsInMedia
    WHERE metaId IN (${parserMetaIds.map(() => '?').join(', ')})
  `).all(...parserMetaIds) as Array<{ mediaId: number; tagId: number; metaId: number }>

  const currentKeys = new Set(
    currentRows.map((row) => assignmentKey(Number(row.mediaId), Number(row.metaId), Number(row.tagId))),
  )

  const matchOptions = {
    preferLongestMatch: options.settings?.preferLongestMatch !== false,
    minTokenLength: 2,
    matchPrecision: options.settings?.matchPrecision ?? 0.5,
  }
  const index = buildTagPathIndex(tags, matchOptions)
  const mediaItems = mediaRepo.findAllOrderedById()
  const total = mediaItems.length
  const items: ParseLibraryTagsPreviewItem[] = []
  let totalNewTags = 0
  let totalProposedTags = 0

  for (let processed = 0; processed < mediaItems.length; processed += 1) {
    if (options.shouldStop?.()) {
      yield {
        type: 'complete',
        summary: {
          totalMedia: total,
          mediaWithNewTags: items.length,
          totalNewTags,
          totalProposedTags,
          stopped: true,
        },
        items,
      }
      return
    }

    const mediaItem = mediaItems[processed]
    const parsed = extractPathPhrases(String(mediaItem.path || ''), matchOptions)
    const matches = matchPathToTagsFromPhrasesWithIndex(
      parsed,
      mediaItem.id,
      index,
      matchOptions,
    )

    const tagsForMedia: ParseLibraryTagsPreviewTag[] = matches.map((match) => {
      const tagId = Number(match.tagId)
      const metaId = Number(match.metaId)
      const tag = tagById.get(tagId)
      const key = assignmentKey(Number(mediaItem.id), metaId, tagId)
      const isNew = !currentKeys.has(key)
      if (isNew) totalNewTags += 1
      totalProposedTags += 1

      return {
        tagId,
        metaId,
        tagName: String(tag?.name || tagId),
        metaName: metaNameById.get(metaId) || String(metaId),
        isNew,
      }
    })

    if (tagsForMedia.some((tag) => tag.isNew)) {
      const item: ParseLibraryTagsPreviewItem = {
        mediaId: Number(mediaItem.id),
        path: String(mediaItem.path || ''),
        tags: tagsForMedia,
      }
      items.push(item)
      yield { type: 'item', item }
    }

    if (processed === 0 || processed === total - 1 || processed % 100 === 0) {
      yield {
        type: 'progress',
        processed: processed + 1,
        total,
        current: String(mediaItem.path || ''),
      }
    }
  }

  yield {
    type: 'complete',
    summary: {
      totalMedia: total,
      mediaWithNewTags: items.length,
      totalNewTags,
      totalProposedTags,
      stopped: false,
    },
    items,
  }
}

export function applyParseLibraryTags(
  db: ApiDb,
  assignments: Array<{ mediaId: number; tagId: number; metaId: number }>,
) {
  const tagsInMediaRepo = createTagsInMediaRepository(db.drizzle)
  const unique = new Map<string, { mediaId: number; tagId: number; metaId: number }>()

  for (const item of assignments) {
    const mediaId = Number(item.mediaId)
    const tagId = Number(item.tagId)
    const metaId = Number(item.metaId)
    if (!mediaId || !tagId || !metaId) continue
    unique.set(assignmentKey(mediaId, metaId, tagId), { mediaId, tagId, metaId })
  }

  const rows = [...unique.values()]
  if (!rows.length) {
    return { applied: 0 }
  }

  const chunkSize = 500
  let applied = 0
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize)
    tagsInMediaRepo.bulkCreate(chunk)
    applied += chunk.length
  }

  return { applied }
}
