import fs from 'fs'
import path from 'path'
import StreamZip from 'node-stream-zip'
import { normalizeMediaPath } from '../utils/normalizeUserPath'

/** Virtual media path: `/abs/archive.zip!/relative/entry.jpg` */
export const ZIP_VIRTUAL_SEP = '!/'

/** Skip entire archive when the .zip file exceeds this size. */
export const MAX_ZIP_BYTES = 2 * 1024 * 1024 * 1024

/** Skip entire archive when it contains more than this many matching image entries. */
export const MAX_ZIP_IMAGE_ENTRIES = 5000

/** Skip a single entry when its uncompressed size exceeds this. */
export const MAX_ENTRY_UNCOMPRESSED_BYTES = 50 * 1024 * 1024

export type ZipSkipReason =
  | 'too_large'
  | 'too_many_entries'
  | 'not_zip'
  | 'unreadable'
  | 'encrypted'

export type ZipSkipped = {
  path: string
  reason: ZipSkipReason
  message: string
}

export type ZipImageEntry = {
  virtualPath: string
  entryName: string
  basename: string
  ext: string
  filesize: number
}

export type ListZipImageEntriesResult =
  | { ok: true; entries: ZipImageEntry[] }
  | { ok: false; skipped: ZipSkipped }

export function buildZipSkipMessage(zipPath: string, reason: ZipSkipReason): string {
  switch (reason) {
    case 'too_large':
      return `Skipped ZIP (too large, >${MAX_ZIP_BYTES} bytes): ${zipPath}`
    case 'too_many_entries':
      return `Skipped ZIP (too many images, >${MAX_ZIP_IMAGE_ENTRIES}): ${zipPath}`
    case 'not_zip':
      return `Skipped path (not a .zip file): ${zipPath}`
    case 'encrypted':
      return `Skipped ZIP (encrypted entries): ${zipPath}`
    case 'unreadable':
    default:
      return `Skipped ZIP (unreadable): ${zipPath}`
  }
}

function skipMessage(zipPath: string, reason: ZipSkipReason): string {
  return buildZipSkipMessage(zipPath, reason)
}

export function isEncryptedZipEntry(entry: { encrypted?: boolean; encryped?: boolean }): boolean {
  // node-stream-zip historically typo'd this field as `encryped`
  return Boolean(entry?.encrypted || entry?.encryped)
}

export function isZipFilePath(filePath: string): boolean {
  return path.extname(String(filePath || '')).toLowerCase() === '.zip'
}

export function isVirtualZipPath(filePath: string): boolean {
  return typeof filePath === 'string' && filePath.includes(ZIP_VIRTUAL_SEP)
}

export function buildVirtualZipPath(zipPath: string, entryName: string): string {
  const normalizedZip = normalizeMediaPath(zipPath)
  const normalizedEntry = normalizeZipEntryName(entryName)
  if (!normalizedEntry) {
    throw new Error(`Invalid zip entry name: ${entryName}`)
  }
  return `${normalizedZip}${ZIP_VIRTUAL_SEP}${normalizedEntry}`
}

export function parseVirtualZipPath(filePath: string): { zipPath: string; entryName: string } | null {
  if (!isVirtualZipPath(filePath)) return null

  const idx = filePath.indexOf(ZIP_VIRTUAL_SEP)
  if (idx <= 0) return null

  const zipPath = normalizeMediaPath(filePath.slice(0, idx))
  const entryName = normalizeZipEntryName(filePath.slice(idx + ZIP_VIRTUAL_SEP.length))
  if (!zipPath || !entryName || !isSafeZipEntryName(entryName)) {
    return null
  }

  return { zipPath, entryName }
}

/** Normalize zip entry to forward-slash relative form without leading slash. */
export function normalizeZipEntryName(entryName: string): string {
  return String(entryName || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
}

export function isSafeZipEntryName(entryName: string): boolean {
  const raw = String(entryName || '').replace(/\\/g, '/')
  if (!raw || raw.includes('\0')) return false
  if (raw.startsWith('/') || path.isAbsolute(raw) || /^[a-zA-Z]:/.test(raw)) return false

  const normalized = normalizeZipEntryName(entryName)
  if (!normalized) return false

  const parts = normalized.split('/')
  for (const part of parts) {
    if (!part || part === '.' || part === '..') return false
  }

  return true
}

function extensionSet(extensions: string[] | Set<string>): Set<string> {
  const set = new Set<string>()
  for (const ext of extensions) {
    const cleaned = String(ext || '').trim().toLowerCase().replace(/^\./, '')
    if (cleaned) set.add(cleaned)
  }
  return set
}

function entryExtension(entryName: string): string {
  const base = path.posix.basename(normalizeZipEntryName(entryName))
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return ''
  return base.slice(dot + 1).toLowerCase()
}

export type ZipGalleryLimits = {
  maxZipBytes?: number
  maxImageEntries?: number
  maxEntryUncompressedBytes?: number
}

function resolveLimits(limits?: ZipGalleryLimits) {
  return {
    maxZipBytes: limits?.maxZipBytes ?? MAX_ZIP_BYTES,
    maxImageEntries: limits?.maxImageEntries ?? MAX_ZIP_IMAGE_ENTRIES,
    maxEntryUncompressedBytes: limits?.maxEntryUncompressedBytes ?? MAX_ENTRY_UNCOMPRESSED_BYTES,
  }
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
  } = resolveLimits(limits)

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
      if (listed.ok) {
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

  const stack = [root]
  const zipPaths: string[] = []
  let scanned = 0

  while (stack.length) {
    const dir = stack.pop()
    if (!dir) continue

    let dirents: fs.Dirent[]
    try {
      dirents = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const dirent of dirents) {
      const filePath = path.join(dir, dirent.name)

      if (excluded.some((exclude) => filePath.includes(exclude))) {
        continue
      }

      if (dirent.isDirectory()) {
        stack.push(filePath)
      } else if (dirent.isFile()) {
        if (expandZips && isZipFilePath(filePath)) {
          zipPaths.push(filePath)
        } else if (regex.test(filePath.toLowerCase())) {
          files.push(filePath)
        }
      }

      scanned += 1
      if (scanned % 500 === 0) {
        await new Promise((resolve) => setImmediate(resolve))
      }
    }
  }

  if (expandZips) {
    for (const zipPath of zipPaths) {
      const listed = await listZipImageEntries(zipPath, extensions)
      if (listed.ok) {
        files.push(...listed.entries.map((entry) => entry.virtualPath))
      } else {
        skippedZips.push(listed.skipped)
      }
    }
  }

  return { files, skippedZips }
}
