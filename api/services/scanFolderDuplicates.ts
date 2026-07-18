import type { ApiDb } from '../types/db'
import path from 'path'
import { readdir, stat } from 'fs/promises'
import { createMediaTypesRepository } from '../db/repositories/mediaTypes'
import { pathsEquivalent } from '../utils/normalizeUserPath'
import { computeFingerprint } from './mediaFingerprint'
import { queryAll } from '../db/utils/rawQuery'

type ScanFolderOptions = {
  folders?: string[]
  paths?: string[]
  excluded?: string[]
  mediaTypeId?: number | string | null
  shouldStop?: () => boolean
}

type ScannedFile = {
  path: string
  basename: string
  filesize: number
}

type LibraryHit = {
  id: number
  path: string
  basename: string | null
  filesize: number | null
  oshash: string | null
  contentHash: string | null
}

function buildExtensionRegex(extensions: string | null | undefined) {
  const parts = String(extensions || '')
    .split(',')
    .map((ext) => ext.trim().toLowerCase())
    .filter(Boolean)
    .map((ext) => ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

  if (!parts.length) {
    return /\.[^./\\]+$/i
  }

  return new RegExp(`\\.(${parts.join('|')})$`, 'i')
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

function sizeBasenameKey(filesize: number, basename: string) {
  return `${filesize}::${basename.toLowerCase()}`
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

  const bySize = new Map<number, ScannedFile[]>()
  const bySizeBasename = new Map<string, ScannedFile[]>()
  for (const file of files) {
    if (!bySize.has(file.filesize)) bySize.set(file.filesize, [])
    bySize.get(file.filesize)!.push(file)

    const key = sizeBasenameKey(file.filesize, file.basename)
    if (!bySizeBasename.has(key)) bySizeBasename.set(key, [])
    bySizeBasename.get(key)!.push(file)
  }

  const withinFolderSizeGroups = [...bySize.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([filesize, group]) => ({
      filesize,
      paths: group.map((item) => item.path),
    }))

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
      const key = sizeBasenameKey(Number(row.filesize) || 0, String(row.basename || path.basename(String(row.path || ''))))
      if (!libraryBySizeBasename.has(key)) libraryBySizeBasename.set(key, [])
      libraryBySizeBasename.get(key)!.push(row)

      const oshash = String(row.oshash || '').trim()
      if (oshash) {
        if (!libraryByOshash.has(oshash)) libraryByOshash.set(oshash, [])
        libraryByOshash.get(oshash)!.push(row)
      }
    }
  }

  const candidateSet = new Set<string>()
  for (const [, group] of bySize) {
    if (group.length > 1) {
      for (const item of group) candidateSet.add(item.path)
    }
  }
  for (const file of files) {
    const key = sizeBasenameKey(file.filesize, file.basename)
    const libraryHits = libraryBySizeBasename.get(key) || []
    if (libraryHits.some((hit) => !pathsEquivalent(String(hit.path), file.path))) {
      candidateSet.add(file.path)
    }
  }

  const candidates = files.filter((file) => candidateSet.has(file.path))
  const inLibrary: Array<{
    path: string
    libraryPath: string
    libraryId: number
    parameter: 'basename_filesize' | 'oshash'
  }> = []
  const withinFolderConfirmed: Array<{
    filesize: number
    paths: string[]
    kind?: string
    value?: string
  }> = []

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

  for (const [filesize, group] of bySize) {
    if (group.length < 2) continue
    const byValue = new Map<string, string[]>()
    let anyFingerprint = false

    for (const item of group) {
      const fp = fingerprintByPath.get(item.path)
      if (!fp) continue
      anyFingerprint = true
      const mapKey = `${fp.kind}:${fp.value}`
      if (!byValue.has(mapKey)) byValue.set(mapKey, [])
      byValue.get(mapKey)!.push(item.path)
    }

    if (anyFingerprint) {
      for (const [mapKey, paths] of byValue) {
        if (paths.length < 2) continue
        const [kind, value] = mapKey.split(':')
        withinFolderConfirmed.push({filesize, paths, kind, value})
      }
    } else {
      withinFolderConfirmed.push({
        filesize,
        paths: group.map((item) => item.path),
      })
    }
  }

  // Deduplicate inLibrary by path+libraryId
  const seenLibrary = new Set<string>()
  const uniqueInLibrary = inLibrary.filter((item) => {
    const key = `${item.path}::${item.libraryId}`
    if (seenLibrary.has(key)) return false
    seenLibrary.add(key)
    return true
  })

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
