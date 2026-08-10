import fs from 'fs'
import path from 'path'
import fse from 'fs-extra'
import {rimraf} from 'rimraf'
import {GENERATED_MEDIA_FOLDERS} from '../../shared/generatedMediaFolders'

const SQLITE_SIDE_FILES = new Set(['db.sqlite-wal', 'db.sqlite-shm'])
const ALWAYS_SKIP_TOP_DIRS = new Set(['backups'])

/** Relative paths skipped when the user turns off generated-cache copy. */
export function getGeneratedCacheSkipPaths(): string[] {
  return [
    'transcode_cache',
    ...Object.values(GENERATED_MEDIA_FOLDERS),
  ]
}

/**
 * Returns false when `relativePath` (from the source DB root) should not be copied.
 * Always skips `backups/` and SQLite WAL/SHM sidecars.
 */
export function shouldCopyDatabasePath(
  relativePath: string,
  includeGeneratedCache: boolean,
): boolean {
  if (!relativePath || relativePath === '.') return true

  const normalized = relativePath.split(/[/\\]/).filter(Boolean)
  const baseName = normalized[normalized.length - 1] || ''

  if (SQLITE_SIDE_FILES.has(baseName)) return false
  if (normalized[0] && ALWAYS_SKIP_TOP_DIRS.has(normalized[0])) return false

  if (!includeGeneratedCache) {
    const joined = normalized.join('/')
    for (const skip of getGeneratedCacheSkipPaths()) {
      const skipNorm = skip.split(/[/\\]/).join('/')
      if (joined === skipNorm || joined.startsWith(`${skipNorm}/`)) {
        return false
      }
    }
  }

  return true
}

export type DuplicateDatabaseCopyOptions = {
  sourceDir: string
  destDir: string
  includeGeneratedCache: boolean
}

export async function copyDatabaseDirectory(
  options: DuplicateDatabaseCopyOptions,
): Promise<void> {
  const {sourceDir, destDir, includeGeneratedCache} = options

  if (!fs.existsSync(sourceDir)) {
    throw new Error('Source database folder not found')
  }
  if (fs.existsSync(destDir)) {
    throw new Error('Destination database folder already exists')
  }

  await fse.ensureDir(destDir)

  try {
    await fse.copy(sourceDir, destDir, {
      overwrite: false,
      errorOnExist: true,
      filter: (src) => {
        const relative = path.relative(sourceDir, src)
        return shouldCopyDatabasePath(relative, includeGeneratedCache)
      },
    })
  } catch (error) {
    await rimraf(destDir)
    throw error
  }
}
