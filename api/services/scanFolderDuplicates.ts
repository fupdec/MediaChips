import type { ApiDb } from '../types/db'
import path from 'path'
import { stat } from 'fs/promises'
import { createMediaTypesRepository } from '../db/repositories/mediaTypes'
import { pathsEquivalent } from '../utils/normalizeUserPath'
import { buildExtensionRegex } from '../utils/mediaExtensions'
import { computeFingerprint } from './mediaFingerprint'
import { queryAll } from '../db/utils/rawQuery'
import { addToSizeBasenameIndex, sizeBasenameKey } from './scanFolderDuplicateIndex'
import {
  buildWithinFolderSizeGroups,
  confirmWithinFolderByFingerprint,
  dedupeInLibraryHits,
  groupScannedFilesBySize,
  selectDuplicateCandidatePaths,
  type InLibraryHit,
  type ScannedFile,
} from './scanFolderDuplicateMatch'
import {listMediaFilesFromRoots} from './mediaFileWalk'
import {mapInOrderedBatches} from './orderedAsyncBatches'

/** Parallel `stat` calls while listing folder contents. */
export const SCAN_FOLDER_STAT_CONCURRENCY = 16
/** Parallel fingerprint/hash reads — keep low for HDD/network shares. */
export const SCAN_FOLDER_FINGERPRINT_CONCURRENCY = 4

type ScanFolderOptions = {
  folders?: string[]
  paths?: string[]
  excluded?: string[]
  mediaTypeId?: number | string | null
  shouldStop?: () => boolean
  statConcurrency?: number
  fingerprintConcurrency?: number
}

type LibraryHit = {
  id: number
  path: string
  basename: string | null
  filesize: number | null
  oshash: string | null
  contentHash: string | null
}

async function* iterateScanFolderDuplicates(db: ApiDb, options: ScanFolderOptions = {}) {
  const {
    folders = [],
    paths: directPaths = [],
    excluded = [],
    mediaTypeId = null,
    shouldStop = () => false,
    statConcurrency = SCAN_FOLDER_STAT_CONCURRENCY,
    fingerprintConcurrency = SCAN_FOLDER_FINGERPRINT_CONCURRENCY,
  } = options

  const mediaTypesRepo = createMediaTypesRepository(db.drizzle)
  const typeId = mediaTypeId == null || mediaTypeId === '' ? null : Number(mediaTypeId)
  const mediaType = typeId != null ? mediaTypesRepo.findById(typeId) : null
  const mediaTypeName = mediaType?.type != null ? String(mediaType.type) : undefined
  const extensionRegex = buildExtensionRegex(mediaType?.extensions)

  const roots = folders.map((folder) => path.resolve(String(folder))).filter(Boolean)
  const seedPaths = directPaths.map((item) => path.resolve(String(item))).filter(Boolean)

  if (!roots.length && !seedPaths.length) {
    yield {type: 'error', message: 'No folders or paths provided'}
    return
  }

  yield {type: 'phase', phase: 'listing'}

  const listed = seedPaths.length
    ? seedPaths.filter((filePath) => extensionRegex.test(filePath.toLowerCase()))
    : await listMediaFilesFromRoots(roots, {extensionRegex, excluded, shouldStop})

  if (shouldStop()) {
    yield {type: 'complete', stopped: true, total: listed.length, withinFolder: [], inLibrary: []}
    return
  }

  yield {
    type: 'progress',
    phase: 'statting',
    processed: 0,
    total: listed.length,
  }

  const files: ScannedFile[] = []
  const limit = Math.max(1, statConcurrency)

  for (let offset = 0; offset < listed.length; offset += limit) {
    if (shouldStop()) break

    const slice = listed.slice(offset, offset + limit)
    const batch = await Promise.all(slice.map(async (filePath) => {
      try {
        const fileStat = await stat(filePath)
        return {
          path: filePath,
          basename: path.basename(filePath),
          filesize: fileStat.size,
        } satisfies ScannedFile
      } catch {
        return null
      }
    }))

    for (let batchIndex = 0; batchIndex < batch.length; batchIndex += 1) {
      const file = batch[batchIndex]
      const index = offset + batchIndex
      if (file) files.push(file)

      if (index % 100 === 0 || index === listed.length - 1) {
        yield {
          type: 'progress',
          phase: 'statting',
          processed: index + 1,
          total: listed.length,
          current: listed[index],
        }
      }
    }
  }

  if (shouldStop()) {
    yield {type: 'complete', stopped: true, total: files.length, withinFolder: [], inLibrary: []}
    return
  }

  const bySize = groupScannedFilesBySize(files)
  const bySizeBasename = new Map<string, ScannedFile[]>()
  for (const file of files) {
    addToSizeBasenameIndex(bySizeBasename, file.filesize, file.basename, file)
  }

  const withinFolderSizeGroups = buildWithinFolderSizeGroups(bySize)

  yield {
    type: 'progress',
    phase: 'library_lookup',
    processed: 0,
    total: files.length,
    withinFolderGroups: withinFolderSizeGroups.length,
  }

  const libraryBySizeBasename = new Map<string, LibraryHit[]>()
  const libraryByOshash = new Map<string, LibraryHit[]>()

  if (typeId != null) {
    const rows = queryAll<LibraryHit>(db, `
      SELECT id, path, basename, filesize, oshash, contentHash
      FROM media
      WHERE mediaTypeId = :mediaTypeId
    `, {mediaTypeId: typeId})

    for (const row of rows) {
      addToSizeBasenameIndex(
        libraryBySizeBasename,
        Number(row.filesize) || 0,
        String(row.basename || path.basename(String(row.path || ''))),
        row,
      )

      const oshash = String(row.oshash || '').trim()
      if (oshash) {
        if (!libraryByOshash.has(oshash)) libraryByOshash.set(oshash, [])
        libraryByOshash.get(oshash)!.push(row)
      }
    }
  }

  const candidateSet = selectDuplicateCandidatePaths(files, bySize, libraryBySizeBasename)
  const candidates = files.filter((file) => candidateSet.has(file.path))
  const inLibrary: InLibraryHit[] = []

  const fingerprintByPath = new Map<string, {kind: string; value: string}>()

  yield {
    type: 'progress',
    phase: 'hashing',
    processed: 0,
    total: candidates.length,
    candidates: candidates.length,
  }

  const hashLimit = Math.max(1, fingerprintConcurrency)

  for (let offset = 0; offset < candidates.length; offset += hashLimit) {
    if (shouldStop()) break

    const slice = candidates.slice(offset, offset + hashLimit)
    const fingerprints = await mapInOrderedBatches(
      slice,
      hashLimit,
      async (file) => computeFingerprint({
        path: file.path,
        filesize: file.filesize,
        mediaType: mediaTypeName,
      }),
    )

    for (let batchIndex = 0; batchIndex < slice.length; batchIndex += 1) {
      const file = slice[batchIndex]
      const index = offset + batchIndex
      const fingerprint = fingerprints[batchIndex]

      if (fingerprint) {
        fingerprintByPath.set(file.path, {
          kind: fingerprint.kind,
          value: fingerprint.value,
        })

        const libraryHits = libraryByOshash.get(fingerprint.value) || []

        for (const hit of libraryHits) {
          if (pathsEquivalent(String(hit.path), file.path)) continue
          inLibrary.push({
            path: file.path,
            libraryPath: String(hit.path),
            libraryId: Number(hit.id),
            parameter: 'oshash',
          })
        }
      }

      if (!fingerprintByPath.has(file.path)) {
        const key = sizeBasenameKey(file.filesize, file.basename)
        const libraryHits = (libraryBySizeBasename.get(key) || [])
          .filter((hit) => !pathsEquivalent(String(hit.path), file.path))
        for (const hit of libraryHits) {
          inLibrary.push({
            path: file.path,
            libraryPath: String(hit.path),
            libraryId: Number(hit.id),
            parameter: 'basename_filesize',
          })
        }
      }

      if (index % 10 === 0 || index === candidates.length - 1) {
        yield {
          type: 'progress',
          phase: 'hashing',
          processed: index + 1,
          total: candidates.length,
          current: file.path,
          candidates: candidates.length,
          inLibrary: inLibrary.length,
        }
      }
    }
  }

  const withinFolderConfirmed = confirmWithinFolderByFingerprint(bySize, fingerprintByPath)
  const uniqueInLibrary = dedupeInLibraryHits(inLibrary)

  yield {
    type: 'complete',
    stopped: shouldStop(),
    total: files.length,
    candidates: candidates.length,
    withinFolder: withinFolderConfirmed,
    withinFolderSizeGroups,
    inLibrary: uniqueInLibrary,
  }
}

export { iterateScanFolderDuplicates }
