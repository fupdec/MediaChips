import path from 'path'
import type {AnyRecord} from '../types/db'

export type MissingMediaIndexes = {
  byOshash: Map<string, AnyRecord[]>
  bySizeNoHash: Map<number, AnyRecord[]>
  targetSizes: Set<number>
}

export function buildMissingIndexes(missingMedia: AnyRecord[]): MissingMediaIndexes {
  const byOshash = new Map<string, AnyRecord[]>()
  const bySizeNoHash = new Map<number, AnyRecord[]>()
  const targetSizes = new Set<number>()

  for (const item of missingMedia) {
    const size = Number(item.filesize) || 0
    targetSizes.add(size)

    if (item.oshash) {
      const key = String(item.oshash)
      if (!byOshash.has(key)) {
        byOshash.set(key, [])
      }
      byOshash.get(key)!.push(item)
      continue
    }

    if (!bySizeNoHash.has(size)) {
      bySizeNoHash.set(size, [])
    }
    bySizeNoHash.get(size)!.push(item)
  }

  return {byOshash, bySizeNoHash, targetSizes}
}

/** Prefer unique basename match when multiple weak (size-only) candidates exist. */
export function pickWeakCandidate(candidates: AnyRecord[], foundPath: string) {
  if (!candidates.length) return null
  if (candidates.length === 1) return candidates[0]

  const foundBasename = path.basename(foundPath).toLowerCase()
  const basenameMatches = candidates.filter(
    (item) => path.basename(String(item.path)).toLowerCase() === foundBasename,
  )

  if (basenameMatches.length === 1) {
    return basenameMatches[0]
  }

  return null
}
