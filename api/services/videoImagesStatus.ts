import type {VideoImageTypeStatus} from '../types/videoImagesGeneration'

export function buildVideoImageStatus(total: number, generated: number): VideoImageTypeStatus {
  return {
    total,
    generated,
    pending: Math.max(total - generated, 0),
  }
}

export function countGeneratedImages(
  items: Array<{id?: unknown}>,
  existingIds: Set<string>,
) {
  let generated = 0
  for (const item of items) {
    if (existingIds.has(String(item.id))) generated += 1
  }
  return generated
}

/** Collect media ids from `123.jpg` filenames. */
export function collectJpgStemIds(files: string[]): Set<string> {
  const ids = new Set<string>()
  for (const file of files) {
    if (file.endsWith('.jpg')) {
      ids.add(file.slice(0, -4))
    }
  }
  return ids
}

/** Parse stem strings to positive integer ids (orphan / non-numeric stems dropped). */
export function parsePositiveStemIds(stemIds: Iterable<string>): number[] {
  const ids: number[] = []
  for (const stem of stemIds) {
    if (!/^\d+$/.test(stem)) continue
    const id = Number(stem)
    if (Number.isSafeInteger(id) && id > 0) ids.push(id)
  }
  return ids
}

