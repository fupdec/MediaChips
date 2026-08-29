import {execFile} from 'child_process'
import fs from 'fs'
import {readdir, stat} from 'fs/promises'
import path from 'path'
import {promisify} from 'util'
import {mapWithConcurrency} from './thumbEncoding'

const execFileAsync = promisify(execFile)

/** Parallel readdir/stat work while walking a tree (DB folders, generated caches). */
export const DIRECTORY_SIZE_CONCURRENCY = 16

/** Prefer OS `du` on Unix — orders of magnitude faster on huge generated-media trees. */
const DU_TIMEOUT_MS = 120_000

export type DirectorySizeOptions = {
  concurrency?: number
  existsSync?: (directory: string) => boolean
  readdir?: typeof readdir
  /** Only `size` is read; keep this narrow so test mocks need not match fs.stat overloads. */
  stat?: (filePath: string) => Promise<{size: number}>
  /** Injected for tests; default uses system `du -sk` on non-Windows. */
  tryNativeDu?: (directory: string) => Promise<number | null>
  /** Force the Node walk (skip `du`), mainly for tests. */
  preferWalk?: boolean
}

/**
 * Disk usage via `du -sk` (1 KiB blocks → bytes). Returns null when unavailable.
 * Matches “space on disk” better than summing logical file sizes for sparse/block files.
 */
export async function tryNativeDirectorySize(directory: string): Promise<number | null> {
  if (process.platform === 'win32') return null
  try {
    const {stdout} = await execFileAsync('du', ['-sk', directory], {
      timeout: DU_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    })
    const match = /^(\d+)/.exec(String(stdout).trim())
    if (!match) return null
    const kib = Number(match[1])
    if (!Number.isFinite(kib) || kib < 0) return null
    return kib * 1024
  } catch {
    return null
  }
}

/**
 * Recursively sum file sizes under `directory`.
 * Prefers native `du` when available; otherwise a BFS walk with bounded concurrency
 * so wide folders cannot open unbounded parallel readdir/stat work.
 */
export async function getDirectorySize(
  directory: string,
  options: DirectorySizeOptions = {},
): Promise<number> {
  const existsSync = options.existsSync ?? fs.existsSync
  if (!directory || !existsSync(directory)) return 0

  if (!options.preferWalk) {
    const tryDu = options.tryNativeDu ?? tryNativeDirectorySize
    const native = await tryDu(directory)
    if (native != null) return native
  }

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
    totalBytes += sizes.reduce((sum, value) => sum + value, 0)
  }

  return totalBytes
}
