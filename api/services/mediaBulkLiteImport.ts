import path from 'path'
import {stat} from 'fs/promises'
import type {DrizzleClient} from '../db/client'
import {createMediaRepository, type MediaInsert} from '../db/repositories/media'
import {createMediaTypesRepository} from '../db/repositories/mediaTypes'
import {invalidateMediaDerivedCaches} from './mediaCacheInvalidation'
import {normalizeMediaPath} from '../utils/normalizeUserPath'
import {buildExtensionRegex, parseMediaExtensions} from '../utils/mediaExtensions'
import {isImageMediaType} from '../utils/mediaType'
import {
  MEDIA_BULK_LITE_ADDED_CAP,
  MEDIA_BULK_LITE_STAT_CONCURRENCY,
  MEDIA_BULK_LITE_TX_CHUNK,
} from '../../shared/mediaBulkImport'
import {chunkArray} from '../db/utils/chunk'
import {getZipEntryInfo, isVirtualZipPath} from './zipGallery'

export type BulkLiteMediaTypeInput = {
  id?: unknown
  type?: unknown
  extensions?: unknown
}

export type BulkLiteImportInput = {
  mediaType: BulkLiteMediaTypeInput
  files?: string[]
  roots?: string[]
  excluded?: string[]
  expandZips?: boolean
  shouldStop?: () => boolean
}

export type BulkLiteImportResult = {
  scanned: number
  inserted: number
  skipped: number
  errors: string[]
  added: Array<{path: string; mediaId: number}>
}

type LiteRow = Partial<MediaInsert> & {path: string}

async function buildLiteRow(
  rawPath: string,
  mediaTypeId: number,
): Promise<{row: LiteRow} | {error: string}> {
  const pathToFile = normalizeMediaPath(rawPath)
  if (!pathToFile) {
    return {error: rawPath || '(empty path)'}
  }

  try {
    if (isVirtualZipPath(pathToFile)) {
      const entryInfo = await getZipEntryInfo(pathToFile)
      if (!entryInfo) {
        return {error: pathToFile}
      }
      return {
        row: {
          path: pathToFile,
          basename: entryInfo.basename,
          name: path.parse(entryInfo.basename).name,
          ext: entryInfo.ext,
          filesize: entryInfo.filesize,
          mediaTypeId,
        },
      }
    }

    const stats = await stat(pathToFile)
    if (!stats.isFile()) {
      return {error: pathToFile}
    }
    const basename = path.basename(pathToFile)
    return {
      row: {
        path: pathToFile,
        basename,
        name: path.parse(basename).name,
        ext: path.extname(pathToFile),
        filesize: stats.size,
        mediaTypeId,
      },
    }
  } catch {
    return {error: pathToFile}
  }
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  shouldStop?: () => boolean,
): Promise<R[]> {
  if (!items.length) return []

  const results = new Array<R>(items.length)
  let nextIndex = 0
  const workerCount = Math.min(Math.max(concurrency, 1), items.length)

  await Promise.all(Array.from({length: workerCount}, async () => {
    while (nextIndex < items.length) {
      if (shouldStop?.()) break
      const index = nextIndex
      nextIndex += 1
      results[index] = await worker(items[index], index)
    }
  }))

  return results
}

async function resolveFileList(input: BulkLiteImportInput, mediaType: {
  id: number
  type?: unknown
  extensions?: unknown
}): Promise<string[]> {
  if (input.files?.length) {
    return [...new Set(input.files.map((filePath) => normalizeMediaPath(filePath)).filter(Boolean))]
  }

  const roots = (input.roots || []).map((root) => normalizeMediaPath(root)).filter(Boolean)
  if (!roots.length) return []

  const excluded = input.excluded || []
  const extensions = parseMediaExtensions(mediaType.extensions)
  const expandZips = Boolean(input.expandZips)
    && isImageMediaType({type: mediaType.type == null ? null : String(mediaType.type)})
    && extensions.length > 0
  const regex = buildExtensionRegex(mediaType.extensions as string | null | undefined)
  const {collectFilesWithZipGalleries} = await import('./zipGallery')

  const files: string[] = []
  for (const root of roots) {
    if (input.shouldStop?.()) break
    const listed = await collectFilesWithZipGalleries({
      entryPath: root,
      regex,
      excluded,
      extensions,
      expandZips,
    })
    for (const filePath of listed.files) {
      files.push(filePath)
    }
  }

  return [...new Set(files)].filter((filePath) => {
    const filename = filePath.split('\\').pop()?.split('/').pop() ?? ''
    return !filename.match(/^\._/)
  })
}

function resolveMediaTypeId(
  drizzle: DrizzleClient,
  mediaType: BulkLiteMediaTypeInput,
): {id: number; type?: unknown; extensions?: unknown} | null {
  if (mediaType && typeof mediaType === 'object' && mediaType.id != null) {
    const id = Number(mediaType.id)
    if (!Number.isFinite(id)) return null
    if (mediaType.extensions != null || mediaType.type != null) {
      return {id, type: mediaType.type, extensions: mediaType.extensions}
    }
    const row = createMediaTypesRepository(drizzle).findById(id)
    if (!row) return {id, type: mediaType.type, extensions: mediaType.extensions}
    return {
      id,
      type: row.type ?? mediaType.type,
      extensions: row.extensions ?? mediaType.extensions,
    }
  }

  const id = Number(mediaType as unknown)
  if (!Number.isFinite(id)) return null
  const row = createMediaTypesRepository(drizzle).findById(id)
  if (!row) return {id}
  return {id, type: row.type, extensions: row.extensions}
}

/**
 * Fast path: insert thin media rows (path + stat) without probe/thumbs/tags.
 */
export async function runMediaBulkLiteImport(
  drizzle: DrizzleClient,
  input: BulkLiteImportInput,
): Promise<BulkLiteImportResult> {
  const mediaType = resolveMediaTypeId(drizzle, input.mediaType)
  if (!mediaType) {
    throw new Error('Media type not found')
  }

  // Prefer roots when both are sent: walk folders server-side, then append explicit files.
  const rootFiles = input.roots?.length
    ? await resolveFileList({...input, files: undefined}, mediaType)
    : []
  const explicitFiles = input.files?.length
    ? await resolveFileList({...input, roots: undefined}, mediaType)
    : []
  const files = [...new Set([...rootFiles, ...explicitFiles])]

  const errors: string[] = []
  const rows: LiteRow[] = []

  const built = await mapPool(
    files,
    MEDIA_BULK_LITE_STAT_CONCURRENCY,
    async (filePath) => buildLiteRow(filePath, mediaType.id),
    input.shouldStop,
  )

  for (const item of built) {
    if (!item) continue
    if ('error' in item) {
      errors.push(item.error)
      continue
    }
    rows.push(item.row)
  }

  const added: Array<{path: string; mediaId: number}> = []
  const txChunks = chunkArray(rows, MEDIA_BULK_LITE_TX_CHUNK)
  let insertedCount = 0

  for (const txChunk of txChunks) {
    if (input.shouldStop?.()) break
    const insertedRows = drizzle.transaction((tx) => (
      createMediaRepository(tx).bulkCreateLite(txChunk)
    ))
    insertedCount += insertedRows.length
    for (const row of insertedRows) {
      if (added.length < MEDIA_BULK_LITE_ADDED_CAP) {
        added.push({path: row.path, mediaId: row.id})
      }
    }
  }

  invalidateMediaDerivedCaches()

  const skipped = Math.max(0, rows.length - insertedCount)

  return {
    scanned: files.length,
    inserted: insertedCount,
    skipped,
    errors: errors.slice(0, MEDIA_BULK_LITE_ADDED_CAP),
    added,
  }
}
