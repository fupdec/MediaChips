import type { ApiDb, TagLike } from '../types/db'
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
import { extractPathRegexTagNames } from '../../shared/pathParser/regexMeta'
import { findTagByNameOrSynonym } from './pathRegexTagResolver'
import {
  assignmentKey,
  buildParseLibraryTagsSummary,
  createPreviewTagCollector,
} from './parseLibraryTagsPreviewHelpers'

export interface ParseLibraryTagsPreviewTag {
  tagId: number
  metaId: number
  tagName: string
  metaName: string
  isNew: boolean
  willCreate?: boolean
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

export type ParseLibraryTagsAssignment = {
  mediaId: number
  metaId: number
  tagId?: number
  tagName?: string
  willCreate?: boolean
}

type PreviewEvent =
  | { type: 'progress'; processed: number; total: number; current?: string }
  | { type: 'item'; item: ParseLibraryTagsPreviewItem }
  | { type: 'complete'; summary: ParseLibraryTagsSummary; items: ParseLibraryTagsPreviewItem[] }
  | { type: 'error'; message: string }

/** Resolve which media rows a parse-library preview should scan. */
export function resolveParseLibraryPreviewMediaItems(
  allItems: Array<{id: number; path: string | null}>,
  mediaIds?: number[] | null,
): Array<{id: number; path: string | null}> {
  if (!mediaIds?.length) return allItems
  const idSet = new Set(
    mediaIds.map(Number).filter((id) => Number.isFinite(id) && id > 0),
  )
  if (!idSet.size) return allItems
  return allItems.filter((item) => idSet.has(Number(item.id)))
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
    /** When set, only scan these media rows (import-batch scoped). */
    mediaIds?: number[]
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
      summary: buildParseLibraryTagsSummary({
        totalMedia: 0,
        mediaWithNewTags: 0,
        totalNewTags: 0,
        totalProposedTags: 0,
        stopped: false,
      }),
      items: [],
    }
    return
  }

  const metaNameById = new Map(parserMetas.map((meta) => [Number(meta.id), String(meta.name || '')]))
  const tags = tagsRepo.findByMetaIds(parserMetaIds)
  const tagLikes = tags as TagLike[]
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

  const allMediaItems = mediaRepo.findAllIdsAndPathsOrderedById()
  const mediaItems = resolveParseLibraryPreviewMediaItems(allMediaItems, options.mediaIds)
  const total = mediaItems.length
  const items: ParseLibraryTagsPreviewItem[] = []
  let totalNewTags = 0
  let totalProposedTags = 0

  for (let processed = 0; processed < mediaItems.length; processed += 1) {
    if (options.shouldStop?.()) {
      yield {
        type: 'complete',
        summary: buildParseLibraryTagsSummary({
          totalMedia: total,
          mediaWithNewTags: items.length,
          totalNewTags,
          totalProposedTags,
          stopped: true,
        }),
        items,
      }
      return
    }

    const mediaItem = mediaItems[processed]
    const filePath = String(mediaItem.path || '')
    const parsed = extractPathPhrases(filePath, matchOptions)
    const matches = matchPathToTagsFromPhrasesWithIndex(
      parsed,
      mediaItem.id,
      index,
      matchOptions,
    )

    const collector = createPreviewTagCollector()

    for (const match of matches) {
      const tagId = Number(match.tagId)
      const metaId = Number(match.metaId)
      const tag = tagById.get(tagId)
      const key = assignmentKey(Number(mediaItem.id), metaId, tagId)
      collector.push({
        tagId,
        metaId,
        tagName: String(tag?.name || tagId),
        metaName: metaNameById.get(metaId) || String(metaId),
        isNew: !currentKeys.has(key),
        willCreate: false,
      })
    }

    const regexExtracts = extractPathRegexTagNames(filePath, parserMetas)
    for (const extract of regexExtracts) {
      const metaId = Number(extract.metaId)
      const existing = findTagByNameOrSynonym(tagLikes, metaId, extract.tagName)

      if (existing?.id != null) {
        const tagId = Number(existing.id)
        const key = assignmentKey(Number(mediaItem.id), metaId, tagId)
        collector.push({
          tagId,
          metaId,
          tagName: String(existing.name || extract.tagName),
          metaName: metaNameById.get(metaId) || String(metaId),
          isNew: !currentKeys.has(key),
          willCreate: false,
        })
        continue
      }

      if (!extract.createTags) continue

      collector.push({
        tagId: 0,
        metaId,
        tagName: extract.tagName,
        metaName: metaNameById.get(metaId) || String(metaId),
        isNew: true,
        willCreate: true,
      })
    }

    totalNewTags += collector.totalNewTags
    totalProposedTags += collector.totalProposedTags

    if (collector.hasNew()) {
      const item: ParseLibraryTagsPreviewItem = {
        mediaId: Number(mediaItem.id),
        path: filePath,
        tags: collector.tags as ParseLibraryTagsPreviewTag[],
      }
      items.push(item)
      yield { type: 'item', item }
    }

    if (processed === 0 || processed === total - 1 || processed % 100 === 0) {
      yield {
        type: 'progress',
        processed: processed + 1,
        total,
        current: filePath,
      }
    }
  }

  yield {
    type: 'complete',
    summary: buildParseLibraryTagsSummary({
      totalMedia: total,
      mediaWithNewTags: items.length,
      totalNewTags,
      totalProposedTags,
      stopped: false,
    }),
    items,
  }
}

export function applyParseLibraryTags(
  db: ApiDb,
  assignments: ParseLibraryTagsAssignment[],
) {
  const tagsRepo = createTagsRepository(db.drizzle, db.sqlite)
  const tagsInMediaRepo = createTagsInMediaRepository(db.drizzle)
  const unique = new Map<string, { mediaId: number; tagId: number; metaId: number }>()
  const tagsByMetaId = new Map<number, TagLike[]>()

  const getTagsForMeta = (metaId: number): TagLike[] => {
    let list = tagsByMetaId.get(metaId)
    if (!list) {
      list = tagsRepo.findByMetaIds([metaId]) as TagLike[]
      tagsByMetaId.set(metaId, list)
    }
    return list
  }

  for (const item of assignments) {
    const mediaId = Number(item.mediaId)
    const metaId = Number(item.metaId)
    if (!mediaId || !metaId) continue

    let tagId = Number(item.tagId || 0)
    const tagName = String(item.tagName || '').trim()
    const willCreate = Boolean(item.willCreate) || tagId <= 0

    if (willCreate) {
      if (!tagName) continue
      const tags = getTagsForMeta(metaId)
      let tag = findTagByNameOrSynonym(tags, metaId, tagName)
      if (!tag) {
        const [created] = tagsRepo.bulkCreate([{metaId, name: tagName}])
        tag = created as TagLike
        tags.push(tag)
      }
      tagId = Number(tag.id)
    }

    if (!tagId) continue
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
