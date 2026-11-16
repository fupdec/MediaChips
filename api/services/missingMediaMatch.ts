import type {AnyRecord} from '../types/db'
import {parseMediaFilePath} from '../../shared/mediaPath'

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

/** Size alone is insufficient; retain every filename match for the user's choice. */
export function findWeakCandidates(candidates: AnyRecord[], foundPath: string) {
  const foundBasename = parseMediaFilePath(foundPath).basename.toLowerCase()
  return candidates.filter((item) => parseMediaFilePath(String(item.path)).basename.toLowerCase() === foundBasename)
}
