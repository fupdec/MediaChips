import fs from 'fs'
import {readdir, stat} from 'fs/promises'
import path from 'path'
import {mapWithConcurrency} from './thumbEncoding'

/** Parallel readdir/stat work while walking a tree (DB folders, generated caches). */
export const DIRECTORY_SIZE_CONCURRENCY = 16

export type DirectorySizeOptions = {
  concurrency?: number
  existsSync?: (directory: string) => boolean
  readdir?: typeof readdir
  /** Only `size` is read; keep this narrow so test mocks need not match fs.stat overloads. */
  stat?: (filePath: string) => Promise<{size: number}>
}

/**
 * Recursively sum file sizes under `directory`.
 * Uses a BFS walk with bounded concurrency so wide folders cannot open
 * unbounded parallel readdir/stat work (unlike Promise.all per entry).
 */
export async function getDirectorySize(
  directory: string,
  options: DirectorySizeOptions = {},
): Promise<number> {
  const existsSync = options.existsSync ?? fs.existsSync
  if (!directory || !existsSync(directory)) return 0

  const concurrency = Math.max(1, options.concurrency ?? DIRECTORY_SIZE_CONCURRENCY)
  const listDir = options.readdir ?? readdir
  const statPath = options.stat ?? stat

  let totalBytes = 0
  let pendingDirs = [directory]

  while (pendingDirs.length) {
    const dirBatch = pendingDirs.splice(0, concurrency)
    const listings = await mapWithConcurrency(dirBatch, concurrency, async (dirPath) => {
      try {
        return await listDir(dirPath, {withFileTypes: true})
      } catch {
        return [] as import('fs').Dirent[]
      }
    })

    const nextDirs: string[] = []
    const files: string[] = []

    for (let i = 0; i < dirBatch.length; i += 1) {
      const dirPath = dirBatch[i]
      for (const entry of listings[i]) {
        const entryPath = path.join(dirPath, entry.name)
        if (entry.isDirectory()) nextDirs.push(entryPath)
        else if (entry.isFile()) files.push(entryPath)
      }
    }

    pendingDirs = pendingDirs.concat(nextDirs)

    if (!files.length) continue

    const sizes = await mapWithConcurrency(files, concurrency, async (filePath) => {
      try {
        const info = await statPath(filePath)
        return info.size
      } catch {
        return 0
      }
    })
    totalBytes += sizes.reduce((sum, size) => sum + size, 0)
  }

  return totalBytes
}
