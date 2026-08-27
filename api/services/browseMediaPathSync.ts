import {normalizeLibraryFolderPath} from '../../shared/libraryFolderBrowse'
import {buildBulkPathUpdatePatch} from './mediaBulkPathUpdate'
import {buildFolderPathLikePatterns} from '../utils/watcherFolderPaths'
import {buildPathLookupVariants} from '../utils/normalizeUserPath'

export type MediaPathSyncRow = {
  id: number
  path: string
}

export type MediaPathSyncRepo = {
  findByPaths(paths: string[]): Array<{id: number; path: string}>
  findIdAndPathByLikePatterns(patterns: string[]): MediaPathSyncRow[]
  updateById(id: number, data: object, options?: {silent?: boolean}): void
}

export function remapMovedMediaPath(
  originalPath: string,
  fromPath: string,
  toPath: string,
): string | null {
  const original = String(originalPath || '')
  const fromNorm = normalizeLibraryFolderPath(fromPath)
  const toNorm = normalizeLibraryFolderPath(toPath)
  if (!original || !fromNorm || !toNorm) return null

  const prefixes = [
    fromPath,
    fromNorm,
    fromNorm.replace(/\//g, '\\'),
  ].filter(Boolean)

  for (const prefix of prefixes) {
    if (!prefix) continue
    if (original === prefix || original.toLowerCase() === prefix.toLowerCase()) {
      return toPath
    }
    for (const sep of ['/', '\\'] as const) {
      const withSep = prefix.replace(/[/\\]+$/, '') + sep
      if (
        original.startsWith(withSep)
        || original.toLowerCase().startsWith(withSep.toLowerCase())
      ) {
        const dest = String(toPath).replace(/[/\\]+$/, '')
        return `${dest}${sep}${original.slice(withSep.length)}`
      }
    }
  }

  const nOld = normalizeLibraryFolderPath(original)
  if (nOld === fromNorm) return toPath
  const childPrefix = fromNorm.endsWith('/') ? fromNorm : `${fromNorm}/`
  if (nOld.startsWith(childPrefix) || nOld.toLowerCase().startsWith(childPrefix.toLowerCase())) {
    return `${toNorm}${nOld.slice(fromNorm.length)}`
  }
  return null
}

export function collectMediaForPathChange(
  repo: MediaPathSyncRepo,
  fromPath: string,
): MediaPathSyncRow[] {
  const exact = repo.findByPaths(buildPathLookupVariants(fromPath))
  const under = repo.findIdAndPathByLikePatterns(buildFolderPathLikePatterns(fromPath))
  const byId = new Map<number, MediaPathSyncRow>()
  for (const row of [...exact, ...under]) {
    if (!row?.id || !row.path) continue
    byId.set(row.id, {id: row.id, path: row.path})
  }
  return [...byId.values()]
}

export function syncMediaPathsForMove(
  repo: MediaPathSyncRepo,
  fromPath: string,
  toPath: string,
): number {
  const rows = collectMediaForPathChange(repo, fromPath)
  let updated = 0
  for (const row of rows) {
    const nextPath = remapMovedMediaPath(row.path, fromPath, toPath)
    if (!nextPath || nextPath === row.path) continue
    const existing = {path: row.path, name: null}
    const patch = buildBulkPathUpdatePatch({id: row.id, path: nextPath}, existing)
    repo.updateById(row.id, {
      path: patch.path,
      basename: patch.basename,
      name: patch.name,
      ext: patch.ext,
    }, {silent: true})
    updated += 1
  }
  return updated
}

export function syncMediaPathsForMoves(
  repo: MediaPathSyncRepo,
  moves: Array<{from: string; to: string}>,
): number {
  let updated = 0
  for (const move of moves) {
    updated += syncMediaPathsForMove(repo, move.from, move.to)
  }
  return updated
}
