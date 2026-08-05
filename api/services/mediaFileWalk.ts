import path from 'path'
import {readdir} from 'fs/promises'

export type MediaFileWalkOptions = {
  excluded?: string[]
  shouldStop?: () => boolean
  /** Yield event loop every N entries/matches (context-dependent). */
  yieldEvery?: number
  /** Used when `classifyFile` is omitted. */
  extensionRegex?: RegExp
  /**
   * Classify a file path:
   * - match → include in files
   * - extra → collect separately (e.g. zip archives)
   * - skip → ignore
   */
  classifyFile?: (filePath: string) => 'match' | 'extra' | 'skip'
}

function defaultClassify(
  filePath: string,
  extensionRegex: RegExp | undefined,
): 'match' | 'extra' | 'skip' {
  if (!extensionRegex) return 'skip'
  return extensionRegex.test(filePath.toLowerCase()) ? 'match' : 'skip'
}

/** Collect matched (+ optional extra) paths from directory roots. */
export async function collectMediaFilesFromRoots(
  roots: string[],
  options: MediaFileWalkOptions = {},
): Promise<{files: string[]; extras: string[]; scanned: number}> {
  const {
    excluded = [],
    shouldStop = () => false,
    yieldEvery = 500,
    extensionRegex,
    classifyFile,
  } = options

  const classify = classifyFile
    ?? ((filePath: string) => defaultClassify(filePath, extensionRegex))

  const files: string[] = []
  const extras: string[] = []
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
      } else if (entry.isFile()) {
        const kind = classify(filePath)
        if (kind === 'match') files.push(filePath)
        else if (kind === 'extra') extras.push(filePath)
      }

      scanned += 1
      if (yieldEvery > 0 && scanned % yieldEvery === 0) {
        await new Promise((resolve) => setImmediate(resolve))
      }
    }
  }

  return {files, extras, scanned}
}

/** List only matched file paths (scanFolderDuplicates-style). */
export async function listMediaFilesFromRoots(
  roots: string[],
  options: MediaFileWalkOptions = {},
): Promise<string[]> {
  const {files} = await collectMediaFilesFromRoots(roots, options)
  return files
}

/**
 * Yield matched files with a running matched-count (missingMediaFinder-style).
 * `scanned` means matched files seen so far.
 */
export async function* walkMatchedMediaFiles(
  roots: string[],
  options: MediaFileWalkOptions = {},
): AsyncGenerator<{path: string; scanned: number}> {
  const {
    excluded = [],
    shouldStop = () => false,
    yieldEvery = 200,
    extensionRegex,
    classifyFile,
  } = options

  const classify = classifyFile
    ?? ((filePath: string) => defaultClassify(filePath, extensionRegex))

  const stack = [...roots]
  let matched = 0

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
      if (shouldStop()) return

      const filePath = path.join(dir, entry.name)

      if (excluded.some((exclude) => filePath.includes(exclude))) {
        continue
      }

      if (entry.isDirectory()) {
        stack.push(filePath)
      } else if (entry.isFile() && classify(filePath) === 'match') {
        matched += 1
        yield {path: filePath, scanned: matched}

        if (yieldEvery > 0 && matched % yieldEvery === 0) {
          await new Promise((resolve) => setImmediate(resolve))
        }
      }
    }
  }
}
