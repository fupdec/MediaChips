import fs from 'fs'
import path from 'path'
import StreamZip from 'node-stream-zip'
import { normalizeMediaPath } from '../utils/normalizeUserPath'
import {
  ZIP_VIRTUAL_SEP,
  MAX_ZIP_BYTES,
  MAX_ZIP_IMAGE_ENTRIES,
  MAX_ENTRY_UNCOMPRESSED_BYTES,
  buildVirtualZipPath,
  buildZipSkipMessage,
  entryExtension,
  extensionSet,
  isEncryptedZipEntry,
  isSafeZipEntryName,
  isVirtualZipPath,
  isZipFilePath,
  normalizeZipEntryName,
  parseVirtualZipPath,
  resolveZipGalleryLimits,
  type ListZipImageEntriesResult,
  type ZipGalleryLimits,
  type ZipImageEntry,
  type ZipSkipReason,
  type ZipSkipped,
} from './zipVirtualPath'
import {collectMediaFilesFromRoots} from './mediaFileWalk'

export {
  ZIP_VIRTUAL_SEP,
  MAX_ZIP_BYTES,
  MAX_ZIP_IMAGE_ENTRIES,
  MAX_ENTRY_UNCOMPRESSED_BYTES,
  buildVirtualZipPath,
  buildZipSkipMessage,
  isEncryptedZipEntry,
  isSafeZipEntryName,
  isVirtualZipPath,
  isZipFilePath,
  normalizeZipEntryName,
  parseVirtualZipPath,
  type ListZipImageEntriesResult,
  type ZipGalleryLimits,
  type ZipImageEntry,
  type ZipSkipReason,
  type ZipSkipped,
} from './zipVirtualPath'

function skipMessage(zipPath: string, reason: ZipSkipReason): string {
  return buildZipSkipMessage(zipPath, reason)
}

export async function listZipImageEntries(
  zipPathRaw: string,
  extensions: string[] | Set<string>,
  limits?: ZipGalleryLimits,
): Promise<ListZipImageEntriesResult> {
  const zipPath = normalizeMediaPath(zipPathRaw)
  const {
    maxZipBytes,
    maxImageEntries,
    maxEntryUncompressedBytes,
  } = resolveZipGalleryLimits(limits)

  if (!isZipFilePath(zipPath)) {
    return {
      ok: false,
      skipped: {
        path: zipPath,
        reason: 'not_zip',
        message: skipMessage(zipPath, 'not_zip'),
      },
    }
  }

  let stats: fs.Stats
  try {
    stats = await fs.promises.stat(zipPath)
  } catch {
    return {
      ok: false,
      skipped: {
        path: zipPath,
        reason: 'unreadable',
        message: skipMessage(zipPath, 'unreadable'),
      },
    }
  }

  if (!stats.isFile()) {
    return {
      ok: false,
      skipped: {
        path: zipPath,
        reason: 'not_zip',
        message: skipMessage(zipPath, 'not_zip'),
      },
    }
  }

  if (stats.size > maxZipBytes) {
    return {
      ok: false,
      skipped: {
        path: zipPath,
        reason: 'too_large',
        message: skipMessage(zipPath, 'too_large'),
      },
    }
  }

  const allowed = extensionSet(extensions)
  const zip = new StreamZip.async({ file: zipPath })

  try {
    const allEntries = await zip.entries()
    const matched: ZipImageEntry[] = []

    for (const entry of Object.values(allEntries)) {
      if (!entry || entry.isDirectory) continue
      if (isEncryptedZipEntry(entry)) {
        return {
          ok: false,
          skipped: {
            path: zipPath,
            reason: 'encrypted',
            message: skipMessage(zipPath, 'encrypted'),
          },
        }
      }

      const entryName = normalizeZipEntryName(String(entry.name || ''))
      if (!isSafeZipEntryName(entryName)) continue

      const ext = entryExtension(entryName)
      if (!ext || !allowed.has(ext)) continue

      const filesize = Number(entry.size) || 0
      if (filesize > maxEntryUncompressedBytes) continue

      matched.push({
        virtualPath: buildVirtualZipPath(zipPath, entryName),
        entryName,
        basename: path.posix.basename(entryName),
        ext: `.${ext}`,
        filesize,
      })

      if (matched.length > maxImageEntries) {
        return {
          ok: false,
          skipped: {
            path: zipPath,
            reason: 'too_many_entries',
            message: skipMessage(zipPath, 'too_many_entries'),
          },
        }
      }
    }

    return { ok: true, entries: matched }
  } catch {
    return {
      ok: false,
      skipped: {
        path: zipPath,
        reason: 'unreadable',
        message: skipMessage(zipPath, 'unreadable'),
      },
    }
  } finally {
    await zip.close().catch(() => undefined)
  }
}

export async function zipEntryExists(virtualPath: string): Promise<boolean> {
  const parsed = parseVirtualZipPath(virtualPath)
  if (!parsed) return false

  try {
    await fs.promises.access(parsed.zipPath, fs.constants.F_OK)
  } catch {
    return false
  }

  const zip = new StreamZip.async({ file: parsed.zipPath })
  try {
    const entry = await zip.entry(parsed.entryName)
    if (!entry || entry.isDirectory) return false
    if (isEncryptedZipEntry(entry)) return false
    return true
  } catch {
    // Some builds only resolve with the exact stored name; try listing.
    try {
      const entries = await zip.entries()
      const hit = Object.values(entries).find((item) => (
        normalizeZipEntryName(String(item?.name || '')) === parsed.entryName
      ))
      return Boolean(hit && !hit.isDirectory && !isEncryptedZipEntry(hit))
    } catch {
      return false
    }
  } finally {
    await zip.close().catch(() => undefined)
  }
}

export async function readZipEntryBuffer(virtualPath: string): Promise<{
  buffer: Buffer
  entryName: string
  zipPath: string
  filesize: number
  zipMtimeMs: number
} | null> {
  const parsed = parseVirtualZipPath(virtualPath)
  if (!parsed) return null

  let zipStats: fs.Stats
  try {
    zipStats = await fs.promises.stat(parsed.zipPath)
  } catch {
    return null
  }

  if (!zipStats.isFile()) return null

  const zip = new StreamZip.async({ file: parsed.zipPath })
  try {
    let entry = await zip.entry(parsed.entryName).catch(() => null)
    if (!entry) {
      const entries = await zip.entries()
      entry = Object.values(entries).find((item) => (
        normalizeZipEntryName(String(item?.name || '')) === parsed.entryName
      )) || null
    }

    if (!entry || entry.isDirectory || isEncryptedZipEntry(entry)) return null

    const filesize = Number(entry.size) || 0
    if (filesize > MAX_ENTRY_UNCOMPRESSED_BYTES) return null

    const buffer = await zip.entryData(entry) as Buffer
    return {
      buffer,
      entryName: parsed.entryName,
      zipPath: parsed.zipPath,
      filesize: buffer.length,
      zipMtimeMs: zipStats.mtimeMs,
    }
  } catch {
    return null
  } finally {
    await zip.close().catch(() => undefined)
  }
}

export async function getZipEntryInfo(virtualPath: string): Promise<{
  zipPath: string
  entryName: string
  basename: string
  ext: string
  filesize: number
} | null> {
  const parsed = parseVirtualZipPath(virtualPath)
  if (!parsed) return null

  try {
    await fs.promises.access(parsed.zipPath, fs.constants.F_OK)
  } catch {
    return null
  }

  const zip = new StreamZip.async({ file: parsed.zipPath })
  try {
    let entry = await zip.entry(parsed.entryName).catch(() => null)
    if (!entry) {
      const entries = await zip.entries()
      entry = Object.values(entries).find((item) => (
        normalizeZipEntryName(String(item?.name || '')) === parsed.entryName
      )) || null
    }

    if (!entry || entry.isDirectory || isEncryptedZipEntry(entry)) return null

    const filesize = Number(entry.size) || 0
    if (filesize <= 0 || filesize > MAX_ENTRY_UNCOMPRESSED_BYTES) return null

    const basename = path.posix.basename(parsed.entryName)
    return {
      zipPath: parsed.zipPath,
      entryName: parsed.entryName,
      basename,
      ext: path.posix.extname(basename),
      filesize,
    }
  } catch {
    return null
  } finally {
    await zip.close().catch(() => undefined)
  }
}

/**
 * Expand a directory tree or a single .zip into loose file paths + virtual zip image paths.
 * `regex` filters loose files; zip entries are filtered by `extensions`.
 */
export async function collectFilesWithZipGalleries(options: {
  entryPath: string
  regex: RegExp
  excluded: string[]
  extensions: string[]
  expandZips: boolean
}): Promise<{ files: string[]; skippedZips: ZipSkipped[] }> {
  const {
    entryPath,
    regex,
    excluded,
    extensions,
    expandZips,
  } = options

  const root = normalizeMediaPath(entryPath)
  const skippedZips: ZipSkipped[] = []
  const files: string[] = []

  let rootStat: fs.Stats
  try {
    rootStat = await fs.promises.lstat(root)
  } catch (error) {
    throw error
  }

  if (rootStat.isFile()) {
    if (expandZips && isZipFilePath(root)) {
      const listed = await listZipImageEntries(root, extensions)
      if (listed.ok === true) {
        files.push(...listed.entries.map((entry) => entry.virtualPath))
      } else {
        skippedZips.push(listed.skipped)
      }
      return { files, skippedZips }
    }

    if (regex.test(root.toLowerCase())) {
      files.push(root)
    }
    return { files, skippedZips }
  }

  if (!rootStat.isDirectory()) {
    throw new Error('not directory')
  }

  const {files: walkedFiles, extras: zipPaths} = await collectMediaFilesFromRoots([root], {
    excluded,
    classifyFile: (filePath) => {
      if (expandZips && isZipFilePath(filePath)) return 'extra'
      if (regex.test(filePath.toLowerCase())) return 'match'
      return 'skip'
    },
  })
  files.push(...walkedFiles)

  if (expandZips) {
    for (const zipPath of zipPaths) {
      const listed = await listZipImageEntries(zipPath, extensions)
      if (listed.ok === true) {
        files.push(...listed.entries.map((entry) => entry.virtualPath))
      } else {
        skippedZips.push(listed.skipped)
      }
    }
  }

  return { files, skippedZips }
}
