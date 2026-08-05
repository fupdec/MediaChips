import type { ApiDb } from '../types/db'
import path from 'path'
import { readdir, stat } from 'fs/promises'
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

type ScanFolderOptions = {
  folders?: string[]
  paths?: string[]
  excluded?: string[]
  mediaTypeId?: number | string | null
  shouldStop?: () => boolean
}

type LibraryHit = {
  id: number
  path: string
  basename: string | null
  filesize: number | null
  oshash: string | null
  contentHash: string | null
}

async function listFilesFromRoots(
  roots: string[],
  {
    extensionRegex,
    excluded = [],
    shouldStop = () => false,
  }: {
    extensionRegex: RegExp
    excluded?: string[]
    shouldStop?: () => boolean
  },
): Promise<string[]> {
  const fileList: string[] = []
  const stack = [...roots]
  let scanned = 0

  while (stack.length && !shouldStop()) {
    const dir = stack.pop()
    if (!dir) continue

    let entries
    try {
      entries = await readdir(dir, {withFileTypes: true})
    } catch {
      continue
    }

    for (const entry of entries) {
      if (shouldStop()) break
      const filePath = path.join(dir, entry.name)

      if (excluded.some((exclude) => filePath.includes(exclude))) {
        continue
      }

      if (entry.isDirectory()) {
        stack.push(filePath)
      } else if (entry.isFile() && extensionRegex.test(filePath.toLowerCase())) {
        fileList.push(filePath)
      }

      scanned += 1
      if (scanned % 500 === 0) {
        await new Promise((resolve) => setImmediate(resolve))
      }
    }
  }

  return fileList
}

async function* iterateScanFolderDuplicates(db: ApiDb, options: ScanFolderOptions = {}) {
  const {
    folders = [],
    paths: directPaths = [],
    excluded = [],
    mediaTypeId = null,
    shouldStop = () => false,
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
    : await listFilesFromRoots(roots, {extensionRegex, excluded, shouldStop})

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
  for (let index = 0; index < listed.length; index += 1) {
    if (shouldStop()) break
    const filePath = listed[index]
    try {
      const fileStat = await stat(filePath)
      files.push({
        path: filePath,
        basename: path.basename(filePath),
        filesize: fileStat.size,
      })
    } catch {
      // skip unreadable
    }

    if (index % 100 === 0 || index === listed.length - 1) {
      yield {
        type: 'progress',
        phase: 'statting',
        processed: index + 1,
        total: listed.length,
        current: filePath,
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

  for (let index = 0; index < candidates.length; index += 1) {
    if (shouldStop()) break
    const file = candidates[index]

    try {
      const fingerprint = await computeFingerprint({
        path: file.path,
        filesize: file.filesize,
        mediaType: mediaTypeName,
      })
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
    } catch {
      // ignore hash failures for scan report
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
