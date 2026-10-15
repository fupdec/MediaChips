import type {BrowseDirectoryResult} from './typedApi/browse'

export type RemoteSelectionProgress = {found: number; skipped: number; inLibrary: number}

/** Expand selected folders before importing so Stop during scanning keeps the
 * original selection retryable. Do not silently import a truncated folder. */
export async function expandRemoteSelection(options: {
  paths: string[]
  directories: ReadonlySet<string>
  load: (path: string) => Promise<BrowseDirectoryResult>
  shouldStop: () => boolean
  onFolderError: (path: string, error: unknown) => void
  isExcluded?: (path: string) => boolean
  onProgress?: (progress: RemoteSelectionProgress) => void
}) {
  const skipped = new Set<string>()
  const inLibrary = new Set<string>()
  const isExcluded = (path: string) => {
    if (!options.isExcluded?.(path)) return false
    skipped.add(path)
    return true
  }
  const files = new Set(options.paths.filter(path => !options.directories.has(path) && !isExcluded(path)))
  const pending = options.paths.filter(path => options.directories.has(path) && !isExcluded(path))
  const visited = new Set<string>()
  const failedFolders = new Set<string>()
  const report = () => options.onProgress?.({found: files.size, skipped: skipped.size, inLibrary: inLibrary.size})
  report()
  let nextFolder = 0
  while (nextFolder < pending.length && !options.shouldStop()) {
    const folder = pending[nextFolder++]
    if (visited.has(folder) || isExcluded(folder)) continue
    visited.add(folder)
    try {
      const result = await options.load(folder)
      if (options.shouldStop()) break
      if (result.truncated) throw new Error('truncated')
      for (const entry of result.entries) {
        if (isExcluded(entry.path)) continue
        if (entry.isDirectory) pending.push(entry.path)
        else if (entry.inLibrary) {
          if (!files.has(entry.path)) inLibrary.add(entry.path)
        }
        else if (entry.addable) files.add(entry.path)
        else skipped.add(entry.path)
      }
    } catch (error) {
      if (options.shouldStop()) break
      failedFolders.add(folder)
      options.onFolderError(folder, error)
    }
    report()
  }
  // Drive names can become available only after an ancestor has been listed.
  for (const file of files) if (isExcluded(file)) files.delete(file)
  report()
  return {paths: [...files], failedFolders: [...failedFolders], stopped: options.shouldStop()}
}
