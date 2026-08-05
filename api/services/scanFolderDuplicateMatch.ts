import {pathsEquivalent} from '../utils/normalizeUserPath'
import {sizeBasenameKey} from './scanFolderDuplicateIndex'

export type ScannedFile = {
  path: string
  basename: string
  filesize: number
}

export type LibraryHitLike = {
  id: number
  path: string
}

export type InLibraryHit = {
  path: string
  libraryPath: string
  libraryId: number
  parameter: 'basename_filesize' | 'oshash'
}

export type WithinFolderGroup = {
  filesize: number
  paths: string[]
  kind?: string
  value?: string
}

export function groupScannedFilesBySize(files: ScannedFile[]) {
  const bySize = new Map<number, ScannedFile[]>()
  for (const file of files) {
    if (!bySize.has(file.filesize)) bySize.set(file.filesize, [])
    bySize.get(file.filesize)!.push(file)
  }
  return bySize
}

export function buildWithinFolderSizeGroups(bySize: Map<number, ScannedFile[]>) {
  return [...bySize.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([filesize, group]) => ({
      filesize,
      paths: group.map((item) => item.path),
    }))
}

export function selectDuplicateCandidatePaths(
  files: ScannedFile[],
  bySize: Map<number, ScannedFile[]>,
  libraryBySizeBasename: Map<string, LibraryHitLike[]>,
): Set<string> {
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
  return candidateSet
}

export function confirmWithinFolderByFingerprint(
  bySize: Map<number, ScannedFile[]>,
  fingerprintByPath: Map<string, {kind: string; value: string}>,
): WithinFolderGroup[] {
  const withinFolderConfirmed: WithinFolderGroup[] = []

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

  return withinFolderConfirmed
}

export function dedupeInLibraryHits(inLibrary: InLibraryHit[]): InLibraryHit[] {
  const seenLibrary = new Set<string>()
  return inLibrary.filter((item) => {
    const key = `${item.path}::${item.libraryId}`
    if (seenLibrary.has(key)) return false
    seenLibrary.add(key)
    return true
  })
}
