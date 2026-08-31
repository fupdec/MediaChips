import path from 'path'
import {eq, inArray} from 'drizzle-orm'
import type {ApiDb} from '../../types/db'
import {createDrizzleClient, closeDrizzleClient} from '../../db/client'
import {nowIso} from '../../db/utils/timestamps'
import * as schema from '../../db/schema'
import {createMediaRepository, type MediaRow} from '../../db/repositories/media'
import {planNearDuplicateMarkIdsToDelete} from '../mediaMergeRemap'
import {buildNullFillPatch} from './matchMedia'
import {buildPathLookupVariants} from '../../utils/normalizeUserPath'
import {copyGeneratedMediaAssets, copyMarkAsset, copyTagAssets} from './copyAssets'
import type {
  LibraryMergeCounts,
  LibraryMergeOptions,
  LibraryMergeProgressCallback,
  LibraryMergeResult,
} from './types'

const YIELD_EVERY = 250
const PROGRESS_EVERY_MS = 300

function emptyCounts(): LibraryMergeCounts {
  return {
    mediaMatched: 0,
    mediaCreated: 0,
    mediaTypesCreated: 0,
    metaCreated: 0,
    tagsCreated: 0,
    linksAdded: 0,
    playlistsCreated: 0,
    marksAdded: 0,
    facesAdded: 0,
    foldersCreated: 0,
    filtersCreated: 0,
    assetsCopied: 0,
    errors: [],
  }
}

function normalizeName(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase()
}

function assertCompatibleSchema(
  sourceSqlite: {prepare: (sql: string) => {get: () => unknown}},
  targetSqlite: {prepare: (sql: string) => {get: () => unknown}},
) {
  const countSql = 'SELECT COUNT(*) as count FROM __drizzle_migrations'
  let sourceCount = 0
  let targetCount = 0
  try {
    sourceCount = Number((sourceSqlite.prepare(countSql).get() as {count: number})?.count || 0)
  } catch {
    throw new Error('Source library has no migration history')
  }
  try {
    targetCount = Number((targetSqlite.prepare(countSql).get() as {count: number})?.count || 0)
  } catch {
    throw new Error('Target library has no migration history')
  }
  if (sourceCount !== targetCount) {
    throw new Error(
      `Incompatible schema versions (source migrations=${sourceCount}, target=${targetCount}). Open each library once so migrations can catch up, then retry.`,
    )
  }
}

function remapOrNull(map: Map<number, number>, id: number | null | undefined): number | null {
  if (id == null) return null
  return map.get(id) ?? null
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

function createThrottledReporter(onProgress?: LibraryMergeProgressCallback) {
  let lastAt = 0
  return async (
    phase: string,
    processed: number,
    total: number,
    current?: string,
    force = false,
  ) => {
    const now = Date.now()
    if (
      !force
      && processed !== 0
      && processed !== total
      && now - lastAt < PROGRESS_EVERY_MS
    ) {
      return
    }
    lastAt = now
    onProgress?.({type: 'progress', phase, processed, total, current})
    // Flush progress writes and keep health checks alive.
    await yieldToEventLoop()
  }
}

type MediaIndexes = {
  byPath: Map<string, MediaRow>
  byContentHash: Map<string, MediaRow>
  byOshash: Map<string, MediaRow>
}

function buildMediaIndexes(rows: MediaRow[]): MediaIndexes {
  const byPath = new Map<string, MediaRow>()
  const byContentHash = new Map<string, MediaRow>()
  const byOshash = new Map<string, MediaRow>()

  for (const row of rows) {
    if (row.deletedAt) continue
    if (row.path) {
      for (const variant of buildPathLookupVariants(row.path)) {
        byPath.set(variant.toLowerCase(), row)
      }
    }
    if (row.contentHash) {
      const typed = `${row.mediaTypeId ?? ''}::${row.contentHash}`
      if (!byContentHash.has(typed)) byContentHash.set(typed, row)
      if (!byContentHash.has(row.contentHash)) byContentHash.set(row.contentHash, row)
    }
    if (row.oshash) {
      const typed = `${row.mediaTypeId ?? ''}::${row.oshash}`
      if (!byOshash.has(typed)) byOshash.set(typed, row)
      if (!byOshash.has(row.oshash)) byOshash.set(row.oshash, row)
    }
  }

  return {byPath, byContentHash, byOshash}
}

function findInIndexes(indexes: MediaIndexes, row: MediaRow): MediaRow | null {
  if (row.path) {
    for (const variant of buildPathLookupVariants(row.path)) {
      const hit = indexes.byPath.get(variant.toLowerCase())
      if (hit) return hit
    }
  }
  if (row.contentHash) {
    const typed = `${row.mediaTypeId ?? ''}::${row.contentHash}`
    const hit = indexes.byContentHash.get(typed) || indexes.byContentHash.get(row.contentHash)
    if (hit) return hit
  }
  if (row.oshash) {
    const typed = `${row.mediaTypeId ?? ''}::${row.oshash}`
    const hit = indexes.byOshash.get(typed) || indexes.byOshash.get(row.oshash)
    if (hit) return hit
  }
  return null
}

function indexMediaRow(indexes: MediaIndexes, row: MediaRow) {
  if (row.path) {
    for (const variant of buildPathLookupVariants(row.path)) {
      indexes.byPath.set(variant.toLowerCase(), row)
    }
  }
  if (row.contentHash) {
    indexes.byContentHash.set(`${row.mediaTypeId ?? ''}::${row.contentHash}`, row)
    indexes.byContentHash.set(row.contentHash, row)
  }
  if (row.oshash) {
    indexes.byOshash.set(`${row.mediaTypeId ?? ''}::${row.oshash}`, row)
    indexes.byOshash.set(row.oshash, row)
  }
}

export async function importLibraryIntoActive(
  targetDb: ApiDb,
  sourceDatabaseId: string,
  options: LibraryMergeOptions = {},
  onProgress?: LibraryMergeProgressCallback,
  isAborted?: () => boolean,
): Promise<LibraryMergeResult> {
  const counts = emptyCounts()
  const copyAssets = options.copyGeneratedAssets !== false
  const report = createThrottledReporter(onProgress)

  const databasesPath = targetDb.path_databases
  if (!databasesPath) {
    throw new Error('Active database path_databases is not set')
  }

  const activeId = targetDb.config?.id
  if (activeId && String(activeId) === String(sourceDatabaseId)) {
    throw new Error('Cannot import a library into itself')
  }

  const sourceLibraryPath = path.join(databasesPath, String(sourceDatabaseId))
  const sourceDbPath = path.join(sourceLibraryPath, 'db.sqlite')
  const targetLibraryPath = targetDb.path
    || path.dirname(path.join(databasesPath, String(activeId || ''), 'db.sqlite'))

  await report('starting', 0, 0, undefined, true)

  const sourceConn = createDrizzleClient(sourceDbPath, {readonly: true})
  const source = sourceConn.drizzle
  const target = targetDb.drizzle

  try {
    if (!targetDb.sqlite) {
      throw new Error('Active database connection is not available')
    }
    assertCompatibleSchema(sourceConn.sqlite, targetDb.sqlite)

    const mediaTypeMap = new Map<number, number>()
    const metaMap = new Map<number, number>()
    const tagMap = new Map<number, number>()
    const mediaMap = new Map<number, number>()
    const createdMediaIds = new Set<number>()
    const createdTagIds = new Set<number>()
    const playlistMap = new Map<number, number>()
    const folderPathMap = new Map<number, number>()
    const watchedFolderMap = new Map<number, number>()
    const filterRowMap = new Map<number, number>()
    const savedFilterMap = new Map<number, number>()
    const tabMap = new Map<number, number>()
    const markIdPairs: Array<{sourceId: number, targetId: number}> = []
    const mediaIdsWithNewMarks = new Set<number>()

    // --- mediaTypes ---
    const sourceMediaTypes = source.select().from(schema.mediaTypes).all()
    const targetMediaTypes = target.select().from(schema.mediaTypes).all()
    await report('mediaTypes', 0, sourceMediaTypes.length, undefined, true)
    for (let i = 0; i < sourceMediaTypes.length; i++) {
      if (isAborted?.()) return {...counts, ok: true, aborted: true}
      const row = sourceMediaTypes[i]
      const byType = targetMediaTypes.find((t) => t.type && t.type === row.type)
      const byName = targetMediaTypes.find(
        (t) => normalizeName(t.name) === normalizeName(row.name) && normalizeName(t.name) !== '',
      )
      const existing = byType || byName
      if (existing) {
        mediaTypeMap.set(row.id, existing.id)
      } else {
        const stamp = nowIso()
        const created = target.insert(schema.mediaTypes).values({
          name: row.name,
          icon: row.icon,
          extensions: row.extensions,
          order: row.order,
          hidden: row.hidden,
          custom: row.custom,
          type: row.type,
          createdAt: stamp,
          updatedAt: stamp,
        }).returning().get()
        mediaTypeMap.set(row.id, created.id)
        targetMediaTypes.push(created)
        counts.mediaTypesCreated += 1
      }
      await report('mediaTypes', i + 1, sourceMediaTypes.length)
    }

    // --- meta ---
    const sourceMeta = source.select().from(schema.meta).all()
    const targetMeta = target.select().from(schema.meta).all()
    await report('meta', 0, sourceMeta.length, undefined, true)

    const metaKey = (row: {type: string | null, name: string | null}) =>
      `${String(row.type || '')}::${normalizeName(row.name)}`

    const targetMetaByKey = new Map(targetMeta.map((row) => [metaKey(row), row]))
    const targetMetaByOldId = new Map(
      targetMeta.filter((row) => row.oldId).map((row) => [String(row.oldId), row]),
    )

    for (let i = 0; i < sourceMeta.length; i++) {
      if (isAborted?.()) return {...counts, ok: true, aborted: true}
      const row = sourceMeta[i]
      let existing = row.oldId ? targetMetaByOldId.get(String(row.oldId)) : undefined
      if (!existing) existing = targetMetaByKey.get(metaKey(row))

      if (existing) {
        metaMap.set(row.id, existing.id)
      } else {
        const stamp = nowIso()
        const {id: _id, parentMetaId: _p, ...rest} = row
        const created = target.insert(schema.meta).values({
          ...rest,
          parentMetaId: null,
          createdAt: row.createdAt || stamp,
          updatedAt: stamp,
        }).returning().get()
        metaMap.set(row.id, created.id)
        targetMetaByKey.set(metaKey(created), created)
        if (created.oldId) targetMetaByOldId.set(String(created.oldId), created)
        counts.metaCreated += 1
      }
      await report('meta', i + 1, sourceMeta.length)
    }

    for (const row of sourceMeta) {
      if (row.parentMetaId == null) continue
      const targetId = metaMap.get(row.id)
      const parentTargetId = metaMap.get(row.parentMetaId)
      if (targetId == null || parentTargetId == null) continue
      target.update(schema.meta)
        .set({parentMetaId: parentTargetId, updatedAt: nowIso()})
        .where(eq(schema.meta.id, targetId))
        .run()
    }

    for (const row of source.select().from(schema.metaSettings).all()) {
      const targetMetaId = metaMap.get(row.metaId)
      if (targetMetaId == null) continue
      const exists = target.select()
        .from(schema.metaSettings)
        .where(eq(schema.metaSettings.metaId, targetMetaId))
        .get()
      if (exists) continue
      const {metaId: _m, ...rest} = row
      target.insert(schema.metaSettings).values({metaId: targetMetaId, ...rest}).run()
    }

    for (const row of source.select().from(schema.metaInMediaTypes).all()) {
      const targetMetaId = metaMap.get(row.metaId)
      const targetMediaTypeId = mediaTypeMap.get(row.mediaTypeId)
      if (targetMetaId == null || targetMediaTypeId == null) continue
      target.insert(schema.metaInMediaTypes).values({
        metaId: targetMetaId,
        mediaTypeId: targetMediaTypeId,
        scraper: row.scraper,
        show: row.show,
        order: row.order,
      }).onConflictDoNothing().run()
    }

    for (const row of source.select().from(schema.pinnedMetas).all()) {
      const a = metaMap.get(row.metaId)
      const b = metaMap.get(row.pinnedMetaId)
      if (a == null || b == null) continue
      target.insert(schema.pinnedMetas).values({
        metaId: a,
        pinnedMetaId: b,
        scraper: row.scraper,
        show: row.show,
        order: row.order,
      }).onConflictDoNothing().run()
    }

    // --- tags ---
    const sourceTags = source.select().from(schema.tags).all()
      .filter((row) => !row.deletedAt)
    const targetTags = target.select().from(schema.tags).all()
      .filter((row) => !row.deletedAt)
    await report('tags', 0, sourceTags.length, undefined, true)

    const targetTagByOldId = new Map(
      targetTags.filter((t) => t.oldId).map((t) => [String(t.oldId), t]),
    )
    const targetTagByName = new Map(
      targetTags.map((t) => [normalizeName(t.name), t]),
    )

    for (let i = 0; i < sourceTags.length; i++) {
      if (isAborted?.()) return {...counts, ok: true, aborted: true}
      const row = sourceTags[i]
      let existing = row.oldId ? targetTagByOldId.get(String(row.oldId)) : undefined
      if (!existing) existing = targetTagByName.get(normalizeName(row.name))

      if (existing) {
        tagMap.set(row.id, existing.id)
      } else {
        const stamp = nowIso()
        const targetMetaId = remapOrNull(metaMap, row.metaId)
        let name = row.name
        if (targetTagByName.has(normalizeName(name))) {
          name = `${row.name} (import)`
        }
        try {
          const created = target.insert(schema.tags).values({
            oldId: row.oldId,
            name,
            synonyms: row.synonyms,
            rating: row.rating,
            favorite: row.favorite,
            bookmark: row.bookmark,
            country: row.country,
            color: row.color,
            views: row.views,
            viewedAt: row.viewedAt,
            metaId: targetMetaId,
            parentTagId: null,
            deletedAt: null,
            trashOriginalName: null,
            createdAt: row.createdAt || stamp,
            updatedAt: stamp,
          }).returning().get()
          tagMap.set(row.id, created.id)
          targetTagByName.set(normalizeName(created.name), created)
          if (created.oldId) targetTagByOldId.set(String(created.oldId), created)
          createdTagIds.add(row.id)
          counts.tagsCreated += 1
        } catch (err) {
          const fallback = targetTagByName.get(normalizeName(row.name))
          if (fallback) {
            tagMap.set(row.id, fallback.id)
          } else {
            counts.errors.push(`Tag "${row.name}": ${err instanceof Error ? err.message : String(err)}`)
          }
        }
      }
      if (i % YIELD_EVERY === 0) await report('tags', i + 1, sourceTags.length, row.name)
      else await report('tags', i + 1, sourceTags.length, row.name)
    }
    await report('tags', sourceTags.length, sourceTags.length, undefined, true)

    for (const row of sourceTags) {
      const targetId = tagMap.get(row.id)
      if (targetId == null || row.parentTagId == null) continue
      const parentTarget = tagMap.get(row.parentTagId)
      if (parentTarget == null) continue
      target.update(schema.tags)
        .set({parentTagId: parentTarget, updatedAt: nowIso()})
        .where(eq(schema.tags.id, targetId))
        .run()
    }

    for (const row of source.select().from(schema.tagsInTags).all()) {
      const parent = tagMap.get(row.parentTagId)
      const child = tagMap.get(row.tagId)
      const metaId = remapOrNull(metaMap, row.metaId)
      if (parent == null || child == null || metaId == null) continue
      target.insert(schema.tagsInTags).values({
        parentTagId: parent,
        tagId: child,
        metaId,
      }).onConflictDoNothing().run()
    }

    for (const row of source.select().from(schema.valuesInTags).all()) {
      const tagId = tagMap.get(row.tagId)
      const metaId = remapOrNull(metaMap, row.metaId)
      if (tagId == null || metaId == null) continue
      target.insert(schema.valuesInTags).values({
        tagId,
        metaId,
        value: row.value,
      }).onConflictDoNothing().run()
    }

    // --- media ---
    const sourceMedia = source.select().from(schema.media).all()
      .filter((row) => !row.deletedAt)
    const mediaRepo = createMediaRepository(target)
    const targetMediaRows = mediaRepo.findAllRaw()
    const indexes = buildMediaIndexes(targetMediaRows)
    const targetOldIds = new Set(
      targetMediaRows.filter((row) => row.oldId).map((row) => String(row.oldId)),
    )

    await report('media', 0, sourceMedia.length, undefined, true)
    for (let i = 0; i < sourceMedia.length; i++) {
      if (isAborted?.()) return {...counts, ok: true, aborted: true}
      if (i > 0 && i % YIELD_EVERY === 0) await yieldToEventLoop()

      const row = sourceMedia[i]
      const matched = findInIndexes(indexes, row)

      if (matched) {
        mediaMap.set(row.id, matched.id)
        counts.mediaMatched += 1
        const patch = buildNullFillPatch(matched, row)
        if (matched.mediaTypeId == null && row.mediaTypeId != null) {
          const mt = mediaTypeMap.get(row.mediaTypeId)
          if (mt != null) patch.mediaTypeId = mt
        }
        if (Object.keys(patch).length) {
          if (patch.oldId && targetOldIds.has(String(patch.oldId))) {
            delete patch.oldId
          }
          mediaRepo.updateById(matched.id, patch)
          Object.assign(matched, patch)
        }
      } else {
        const stamp = nowIso()
        const targetMediaTypeId = remapOrNull(mediaTypeMap, row.mediaTypeId)
        let oldId = row.oldId
        if (oldId && targetOldIds.has(String(oldId))) oldId = null

        try {
          const created = target.insert(schema.media).values({
            path: row.path,
            basename: row.basename,
            name: row.name,
            ext: row.ext,
            filesize: row.filesize,
            contentHash: row.contentHash,
            oshash: row.oshash,
            visualHash: row.visualHash,
            visualHashTiles: row.visualHashTiles,
            rating: row.rating,
            favorite: row.favorite,
            bookmark: row.bookmark,
            views: row.views,
            oldId,
            viewedAt: row.viewedAt,
            mediaCreatedAt: row.mediaCreatedAt,
            deletedAt: null,
            trashOriginalPath: null,
            trashPurgeFile: false,
            mediaTypeId: targetMediaTypeId,
            createdAt: row.createdAt || stamp,
            updatedAt: stamp,
          }).returning().get()
          mediaMap.set(row.id, created.id)
          createdMediaIds.add(row.id)
          if (oldId) targetOldIds.add(String(oldId))
          indexMediaRow(indexes, created)
          counts.mediaCreated += 1
        } catch (err) {
          const again = findInIndexes(indexes, row)
          if (again) {
            mediaMap.set(row.id, again.id)
            counts.mediaMatched += 1
          } else {
            counts.errors.push(`Media "${row.path}": ${err instanceof Error ? err.message : String(err)}`)
          }
        }
      }
      await report('media', i + 1, sourceMedia.length, row.path || undefined)
    }
    await report('media', sourceMedia.length, sourceMedia.length, undefined, true)

    // --- 1:1 metadata (prefer created; null-fill matched only when missing) ---
    await report('links', 0, 1, undefined, true)

    const copyMetaTable = <T extends {mediaId: number}>(
      table: typeof schema.videoMetadata | typeof schema.imageMetadata | typeof schema.textContent | typeof schema.mediaClipEmbeddings,
      rows: T[],
    ) => {
      for (const row of rows) {
        const targetMediaId = mediaMap.get(row.mediaId)
        if (targetMediaId == null) continue
        if (!createdMediaIds.has(row.mediaId)) {
          const existing = target.select().from(table).where(eq(table.mediaId, targetMediaId)).get()
          if (existing) continue
        }
        const {mediaId: _m, ...rest} = row as T & {mediaId: number}
        try {
          target.insert(table).values({mediaId: targetMediaId, ...rest} as never).onConflictDoNothing().run()
        } catch (err) {
          counts.errors.push(`Metadata for media ${row.mediaId}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }

    // Avoid loading CLIP embeddings / full metadata for the whole library.
    // Created media get full 1:1 metadata; matched media already received scalar null-fill.
    if (createdMediaIds.size) {
      const createdSourceIds = [...createdMediaIds]
      for (let offset = 0; offset < createdSourceIds.length; offset += 500) {
        const chunk = createdSourceIds.slice(offset, offset + 500)
        copyMetaTable(
          schema.videoMetadata,
          source.select().from(schema.videoMetadata).where(inArray(schema.videoMetadata.mediaId, chunk)).all(),
        )
        copyMetaTable(
          schema.imageMetadata,
          source.select().from(schema.imageMetadata).where(inArray(schema.imageMetadata.mediaId, chunk)).all(),
        )
        copyMetaTable(
          schema.textContent,
          source.select().from(schema.textContent).where(inArray(schema.textContent.mediaId, chunk)).all(),
        )
        copyMetaTable(
          schema.mediaClipEmbeddings,
          source.select().from(schema.mediaClipEmbeddings).where(inArray(schema.mediaClipEmbeddings.mediaId, chunk)).all(),
        )
        await yieldToEventLoop()
      }
    }
    let linkProcessed = 0
    const sourceTagsInMedia = source.select().from(schema.tagsInMedia).all()
    for (const row of sourceTagsInMedia) {
      const mediaId = mediaMap.get(row.mediaId)
      const tagId = tagMap.get(row.tagId)
      const metaId = remapOrNull(metaMap, row.metaId)
      if (mediaId == null || tagId == null || metaId == null) continue
      try {
        target.insert(schema.tagsInMedia).values({
          mediaId,
          tagId,
          metaId,
        }).onConflictDoNothing().run()
        counts.linksAdded += 1
      } catch {
        // ignore unique conflicts
      }
      linkProcessed += 1
      if (linkProcessed % YIELD_EVERY === 0) {
        await report('links', linkProcessed, sourceTagsInMedia.length)
      }
    }

    for (const row of source.select().from(schema.valuesInMedia).all()) {
      const mediaId = mediaMap.get(row.mediaId)
      const metaId = remapOrNull(metaMap, row.metaId)
      if (mediaId == null || metaId == null) continue
      target.insert(schema.valuesInMedia).values({
        mediaId,
        metaId,
        value: row.value,
      }).onConflictDoNothing().run()
    }

    await report('links', 1, 1, undefined, true)

    // --- playlists ---
    const sourcePlaylists = source.select().from(schema.playlists).all()
      .filter((p) => !p.deletedAt)
    const targetPlaylists = target.select().from(schema.playlists).all()
      .filter((p) => !p.deletedAt)
    await report('playlists', 0, sourcePlaylists.length, undefined, true)

    for (let i = 0; i < sourcePlaylists.length; i++) {
      if (isAborted?.()) return {...counts, ok: true, aborted: true}
      const row = sourcePlaylists[i]
      const existing = targetPlaylists.find((p) => normalizeName(p.name) === normalizeName(row.name))
      if (existing) {
        playlistMap.set(row.id, existing.id)
      } else {
        const stamp = nowIso()
        const created = target.insert(schema.playlists).values({
          name: row.name,
          favorite: row.favorite,
          oldId: row.oldId,
          deletedAt: null,
          createdAt: row.createdAt || stamp,
          updatedAt: stamp,
        }).returning().get()
        playlistMap.set(row.id, created.id)
        targetPlaylists.push(created)
        counts.playlistsCreated += 1
      }
      await report('playlists', i + 1, sourcePlaylists.length)
    }

    for (const row of source.select().from(schema.mediaInPlaylists).all()) {
      const mediaId = mediaMap.get(row.mediaId)
      const playlistId = playlistMap.get(row.playlistId)
      if (mediaId == null || playlistId == null) continue
      target.insert(schema.mediaInPlaylists).values({
        mediaId,
        playlistId,
        order: row.order,
      }).onConflictDoNothing().run()
    }

    // --- marks ---
    const sourceMarks = source.select().from(schema.marks).all()
      .filter((m) => !m.deletedAt)
    const existingMarksByMedia = new Map<number, Array<{
      type: string | null
      tagId: number | null
      time: number | null
    }>>()
    await report('marks', 0, sourceMarks.length, undefined, true)

    for (let i = 0; i < sourceMarks.length; i++) {
      if (isAborted?.()) return {...counts, ok: true, aborted: true}
      if (i > 0 && i % YIELD_EVERY === 0) await yieldToEventLoop()

      const row = sourceMarks[i]
      const mediaId = row.mediaId != null ? mediaMap.get(row.mediaId) : null
      if (mediaId == null) continue
      const tagId = remapOrNull(tagMap, row.tagId)

      let existingMarks = existingMarksByMedia.get(mediaId)
      if (!existingMarks) {
        existingMarks = target.select().from(schema.marks)
          .where(eq(schema.marks.mediaId, mediaId))
          .all()
          .filter((m) => !m.deletedAt)
          .map((m) => ({
            type: m.type,
            tagId: m.tagId,
            time: m.time,
          }))
        existingMarksByMedia.set(mediaId, existingMarks)
      }

      const nearDup = existingMarks.some((m) => {
        if (String(m.type || '') !== String(row.type || '')) return false
        if ((m.tagId ?? null) !== (tagId ?? null)) return false
        return Math.abs((Number(m.time) || 0) - (Number(row.time) || 0)) <= 1.5
      })
      if (nearDup) continue

      const created = target.insert(schema.marks).values({
        type: row.type,
        text: row.text,
        time: row.time,
        end: row.end,
        tagId,
        mediaId,
        icon: row.icon,
        deletedAt: null,
      }).returning().get()
      markIdPairs.push({sourceId: row.id, targetId: created.id})
      mediaIdsWithNewMarks.add(mediaId)
      existingMarks.push({type: row.type, tagId, time: row.time})
      counts.marksAdded += 1
      await report('marks', i + 1, sourceMarks.length)
    }

    for (const mediaId of mediaIdsWithNewMarks) {
      const rows = target.select().from(schema.marks)
        .where(eq(schema.marks.mediaId, mediaId))
        .all()
        .filter((m) => !m.deletedAt)
      const toDelete = planNearDuplicateMarkIdsToDelete(rows)
      for (const id of toDelete) {
        target.delete(schema.marks).where(eq(schema.marks.id, id)).run()
      }
    }

    // --- faces (created media always; matched only if target has none) ---
    const targetMediaWithFaces = new Set(
      target.select({mediaId: schema.faces.mediaId}).from(schema.faces).all()
        .map((row) => row.mediaId),
    )
    const sourceFaces = source.select().from(schema.faces).all()
    await report('faces', 0, sourceFaces.length, undefined, true)
    for (let i = 0; i < sourceFaces.length; i++) {
      if (isAborted?.()) return {...counts, ok: true, aborted: true}
      if (i > 0 && i % YIELD_EVERY === 0) await yieldToEventLoop()

      const row = sourceFaces[i]
      const mediaId = mediaMap.get(row.mediaId)
      if (mediaId == null) continue
      if (!createdMediaIds.has(row.mediaId) && targetMediaWithFaces.has(mediaId)) continue

      const tagId = remapOrNull(tagMap, row.tagId)
      target.insert(schema.faces).values({
        mediaId,
        timestamp: row.timestamp,
        score: row.score,
        x: row.x,
        y: row.y,
        width: row.width,
        height: row.height,
        cropPath: row.cropPath,
        embedding: row.embedding,
        tagId,
        matchScore: row.matchScore,
        matchStatus: row.matchStatus,
        createdAt: row.createdAt || nowIso(),
      }).run()
      targetMediaWithFaces.add(mediaId)
      counts.facesAdded += 1
      await report('faces', i + 1, sourceFaces.length)
    }

    for (const row of source.select().from(schema.faceEnrollments).all()) {
      const tagId = tagMap.get(row.tagId)
      const metaId = remapOrNull(metaMap, row.metaId)
      if (tagId == null || metaId == null) continue
      target.insert(schema.faceEnrollments).values({
        tagId,
        metaId,
        source: row.source,
        sourcePath: row.sourcePath,
        embedding: row.embedding,
        createdAt: row.createdAt || nowIso(),
      }).run()
    }

    // --- folders ---
    const sourceFolders = source.select().from(schema.folderPaths).all()
    const targetFolders = target.select().from(schema.folderPaths).all()
    await report('folders', 0, sourceFolders.length, undefined, true)
    for (const row of sourceFolders) {
      const existing = targetFolders.find((f) => f.path === row.path)
      if (existing) {
        folderPathMap.set(row.id, existing.id)
      } else {
        const stamp = nowIso()
        const created = target.insert(schema.folderPaths).values({
          path: row.path,
          createdAt: row.createdAt || stamp,
          updatedAt: stamp,
        }).returning().get()
        folderPathMap.set(row.id, created.id)
        targetFolders.push(created)
        counts.foldersCreated += 1
      }
    }

    for (const row of source.select().from(schema.tagsInFolders).all()) {
      const folderId = folderPathMap.get(row.folderId)
      const tagId = tagMap.get(row.tagId)
      const metaId = remapOrNull(metaMap, row.metaId)
      if (folderId == null || tagId == null || metaId == null) continue
      target.insert(schema.tagsInFolders).values({
        folderId,
        tagId,
        metaId,
      }).onConflictDoNothing().run()
    }

    const sourceWatched = source.select().from(schema.watchedFolders).all()
    const targetWatched = target.select().from(schema.watchedFolders).all()
    for (const row of sourceWatched) {
      const existing = targetWatched.find((f) => f.path === row.path)
      if (existing) {
        watchedFolderMap.set(row.id, existing.id)
      } else {
        const stamp = nowIso()
        const created = target.insert(schema.watchedFolders).values({
          path: row.path,
          name: row.name,
          watch: row.watch,
          icon: row.icon,
          excludedPaths: row.excludedPaths,
          createdAt: row.createdAt || stamp,
          updatedAt: stamp,
        }).returning().get()
        watchedFolderMap.set(row.id, created.id)
        targetWatched.push(created)
        counts.foldersCreated += 1
      }
    }

    for (const row of source.select().from(schema.mediaTypesInWatchedFolders).all()) {
      const folderId = watchedFolderMap.get(row.folderId)
      const mediaTypeId = mediaTypeMap.get(row.mediaTypeId)
      if (folderId == null || mediaTypeId == null) continue
      target.insert(schema.mediaTypesInWatchedFolders).values({
        folderId,
        mediaTypeId,
      }).onConflictDoNothing().run()
    }

    // --- filters / tabs ---
    const sourceFilterRows = source.select().from(schema.filterRows).all()
    await report('filters', 0, sourceFilterRows.length, undefined, true)
    for (const row of sourceFilterRows) {
      const stamp = nowIso()
      const created = target.insert(schema.filterRows).values({
        param: row.param,
        type: row.type,
        cond: row.cond,
        val: row.val,
        active: row.active,
        note: row.note,
        lock: row.lock,
        union: row.union,
        metaId: remapOrNull(metaMap, row.metaId),
        order: row.order,
        createdAt: row.createdAt || stamp,
        updatedAt: stamp,
      }).returning().get()
      filterRowMap.set(row.id, created.id)
      counts.filtersCreated += 1
    }

    for (const row of source.select().from(schema.tagsInFilterRows).all()) {
      const tagId = tagMap.get(row.tagId)
      const rowId = filterRowMap.get(row.rowId)
      const metaId = remapOrNull(metaMap, row.metaId)
      if (tagId == null || rowId == null || metaId == null) continue
      target.insert(schema.tagsInFilterRows).values({
        tagId,
        rowId,
        metaId,
      }).onConflictDoNothing().run()
    }

    for (const row of source.select().from(schema.tabs).all()) {
      const stamp = nowIso()
      const created = target.insert(schema.tabs).values({
        name: row.name,
        icon: row.icon,
        url: row.url,
        order: row.order,
        metaId: remapOrNull(metaMap, row.metaId),
        mediaTypeId: remapOrNull(mediaTypeMap, row.mediaTypeId),
        tagId: remapOrNull(tagMap, row.tagId),
        createdAt: row.createdAt || stamp,
        updatedAt: stamp,
      }).returning().get()
      tabMap.set(row.id, created.id)
      counts.filtersCreated += 1
    }

    for (const row of source.select().from(schema.savedFilters).all().filter((f) => !f.deletedAt)) {
      const stamp = nowIso()
      const created = target.insert(schema.savedFilters).values({
        name: row.name,
        metaId: remapOrNull(metaMap, row.metaId),
        mediaTypeId: remapOrNull(mediaTypeMap, row.mediaTypeId),
        tagId: remapOrNull(tagMap, row.tagId),
        tabId: remapOrNull(tabMap, row.tabId),
        sortBy: row.sortBy,
        sortDir: row.sortDir,
        size: row.size,
        view: row.view,
        groupBy: row.groupBy,
        filtersJoin: row.filtersJoin,
        icon: row.icon,
        deletedAt: null,
        createdAt: row.createdAt || stamp,
        updatedAt: stamp,
      }).returning().get()
      savedFilterMap.set(row.id, created.id)
      counts.filtersCreated += 1
    }

    for (const row of source.select().from(schema.filterRowsInSavedFilters).all()) {
      const filterId = savedFilterMap.get(row.filterId)
      const rowId = filterRowMap.get(row.rowId)
      if (filterId == null || rowId == null) continue
      target.insert(schema.filterRowsInSavedFilters).values({
        filterId,
        rowId,
      }).onConflictDoNothing().run()
    }

    await report('filters', sourceFilterRows.length, sourceFilterRows.length, undefined, true)

    // --- assets ---
    if (copyAssets) {
      const createdList = [...createdMediaIds]
      const totalAssets = createdList.length + createdTagIds.size + markIdPairs.length
      await report('assets', 0, totalAssets, undefined, true)

      let processed = 0
      for (const sourceMediaId of createdList) {
        if (isAborted?.()) return {...counts, ok: true, aborted: true}
        const targetMediaId = mediaMap.get(sourceMediaId)
        if (targetMediaId == null) continue
        counts.assetsCopied += copyGeneratedMediaAssets({
          sourceLibraryPath,
          targetLibraryPath,
          sourceMediaId,
          targetMediaId,
        })
        processed += 1
        if (processed % 50 === 0) await report('assets', processed, totalAssets)
      }

      for (const sourceTagId of createdTagIds) {
        if (isAborted?.()) return {...counts, ok: true, aborted: true}
        const sourceTag = sourceTags.find((t) => t.id === sourceTagId)
        const targetTagId = tagMap.get(sourceTagId)
        if (!sourceTag || targetTagId == null || sourceTag.metaId == null) continue
        const targetMetaId = metaMap.get(sourceTag.metaId)
        if (targetMetaId == null) continue
        counts.assetsCopied += copyTagAssets({
          sourceLibraryPath,
          targetLibraryPath,
          sourceMetaId: sourceTag.metaId,
          targetMetaId,
          sourceTagId,
          targetTagId,
        })
        processed += 1
        await report('assets', processed, totalAssets)
      }

      for (const pair of markIdPairs) {
        if (copyMarkAsset({
          sourceLibraryPath,
          targetLibraryPath,
          sourceMarkId: pair.sourceId,
          targetMarkId: pair.targetId,
        })) {
          counts.assetsCopied += 1
        }
        processed += 1
      }
      await report('assets', processed, totalAssets, undefined, true)
    }

    await report('complete', 1, 1, undefined, true)
    return {...counts, ok: true}
  } finally {
    closeDrizzleClient(sourceConn)
  }
}

export type {LibraryMergeResult, LibraryMergeCounts, LibraryMergeOptions}
