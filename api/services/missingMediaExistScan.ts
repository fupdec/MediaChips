import {fileExists} from './contentHash'

/** Parallel FS existence checks without flooding the disk. */
export const MISSING_MEDIA_EXIST_CONCURRENCY = 16

export type MissingMediaExistItem = {
  path?: string | null
}

/**
 * Collect library rows whose paths no longer exist on disk.
 * Uses bounded concurrency; honors shouldStop between checks.
 * Preserves input order in the returned missing list.
 */
export async function collectMissingMediaByPathExist<T extends MissingMediaExistItem>(
  items: T[],
  options: {
    shouldStop?: () => boolean
    onProgress?: (processed: number, total: number, missingCount: number) => void | Promise<void>
    concurrency?: number
    pathExists?: (filePath: string) => Promise<boolean>
  } = {},
): Promise<T[]> {
  if (!items.length) return []

  const shouldStop = options.shouldStop || (() => false)
  const pathExists = options.pathExists || fileExists
  const concurrency = Math.max(1, options.concurrency ?? MISSING_MEDIA_EXIST_CONCURRENCY)
  const total = items.length
  const missingFlags = new Array<boolean>(total).fill(false)
  let processed = 0
  let missingCount = 0
  let nextIndex = 0

  const worker = async () => {
    while (true) {
      if (shouldStop()) return
      const index = nextIndex
      nextIndex += 1
      if (index >= total) return

      const item = items[index]
      const filePath = String(item?.path || '')
      const exists = filePath ? await pathExists(filePath) : false
      if (shouldStop()) return

      if (!exists) {
        missingFlags[index] = true
        missingCount += 1
      }
      processed += 1
      if (options.onProgress && (processed % 100 === 0 || processed === total)) {
        await options.onProgress(processed, total, missingCount)
      }
    }
  }

  await Promise.all(
    Array.from({length: Math.min(concurrency, total)}, () => worker()),
  )

  return items.filter((_, index) => missingFlags[index])
}
