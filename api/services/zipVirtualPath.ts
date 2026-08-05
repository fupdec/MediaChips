import path from 'path'
import {normalizeMediaPath} from '../utils/normalizeUserPath'

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
  | {ok: true; entries: ZipImageEntry[]}
  | {ok: false; skipped: ZipSkipped}

export type ZipGalleryLimits = {
  maxZipBytes?: number
  maxImageEntries?: number
  maxEntryUncompressedBytes?: number
}

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

export function isEncryptedZipEntry(entry: {encrypted?: boolean; encryped?: boolean}): boolean {
  // node-stream-zip historically typo'd this field as `encryped`
  return Boolean(entry?.encrypted || entry?.encryped)
}

export function isZipFilePath(filePath: string): boolean {
  return path.extname(String(filePath || '')).toLowerCase() === '.zip'
}

/**
 * True only for `something.zip!/entry` paths.
 * Do not treat ordinary folders that contain `!` (e.g. `Back Out Again!/01.jpg`) as zip virtual paths.
 */
export function isVirtualZipPath(filePath: string): boolean {
  if (typeof filePath !== 'string') return false
  const idx = filePath.indexOf(ZIP_VIRTUAL_SEP)
  if (idx <= 0) return false
  const zipPart = filePath.slice(0, idx).replace(/\\/g, '/')
  return /\.zip$/i.test(zipPart)
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

export function buildVirtualZipPath(zipPath: string, entryName: string): string {
  const normalizedZip = normalizeMediaPath(zipPath)
  const normalizedEntry = normalizeZipEntryName(entryName)
  if (!normalizedEntry) {
    throw new Error(`Invalid zip entry name: ${entryName}`)
  }
  return `${normalizedZip}${ZIP_VIRTUAL_SEP}${normalizedEntry}`
}

export function parseVirtualZipPath(filePath: string): {zipPath: string; entryName: string} | null {
  if (!isVirtualZipPath(filePath)) return null

  const idx = filePath.indexOf(ZIP_VIRTUAL_SEP)
  if (idx <= 0) return null

  const zipPath = normalizeMediaPath(filePath.slice(0, idx))
  const entryName = normalizeZipEntryName(filePath.slice(idx + ZIP_VIRTUAL_SEP.length))
  if (!zipPath || !isZipFilePath(zipPath) || !entryName || !isSafeZipEntryName(entryName)) {
    return null
  }

  return {zipPath, entryName}
}

export function extensionSet(extensions: string[] | Set<string>): Set<string> {
  const set = new Set<string>()
  for (const ext of extensions) {
    const cleaned = String(ext || '').trim().toLowerCase().replace(/^\./, '')
    if (cleaned) set.add(cleaned)
  }
  return set
}

export function entryExtension(entryName: string): string {
  const base = path.posix.basename(normalizeZipEntryName(entryName))
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return ''
  return base.slice(dot + 1).toLowerCase()
}

export function resolveZipGalleryLimits(limits?: ZipGalleryLimits) {
  return {
    maxZipBytes: limits?.maxZipBytes ?? MAX_ZIP_BYTES,
    maxImageEntries: limits?.maxImageEntries ?? MAX_ZIP_IMAGE_ENTRIES,
    maxEntryUncompressedBytes: limits?.maxEntryUncompressedBytes ?? MAX_ENTRY_UNCOMPRESSED_BYTES,
  }
}
