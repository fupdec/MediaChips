import type { ApiDb } from '../types/db'
import {projectPath} from '../../shared/projectRoot'
import fs from 'fs'
import fse from 'fs-extra'
import http from 'http'
import https from 'https'
import path from 'path'
import {promisify} from 'util'
import {execFile as execFileCb} from 'child_process'
import {readdir} from 'fs/promises'
import StreamZip from 'node-stream-zip'
import {createSettingsRepository} from '../db/repositories/settings'
import {createMetaRepository} from '../db/repositories/meta'
import {createTagsRepository} from '../db/repositories/tags'
import {unlinkIfExists} from './localAssetCleanup'
import {
  getDisplayDimensions,
  getImageMetadata,
  processAndSaveImage,
  readExifOrientation,
} from './imageMedia'
import {
  TAG_AI_UPSCALE_TYPES,
  getTagAiUpscaleTargetWidth,
  getTagImageDownscaleTarget,
  isTagAiUpscaleType,
  parseTagImageFileName,
  type TagAiUpscaleType,
} from '../../shared/tagImages'
import {parseBooleanSetting} from '../utils/parseBooleanSetting'

const execFile = promisify(execFileCb)

/** V5: also downscales oversized tag posters/avatars to app limits. */
export const TAG_IMAGES_AI_UPSCALED_SETTING = 'migrations.tagImagesAiUpscaledV5'

/** Portable Real-ESRGAN ncnn-vulkan release (includes binary + models). */
export const REALESRGAN_NCNN_RELEASE = 'v0.2.5.0'
export const REALESRGAN_NCNN_BUILD = '20220424'
export const REALESRGAN_MODEL_NAME = 'realesrgan-x4plus'
/**
 * x4plus only supports scale 4 in ncnn-vulkan.
 * Using -s 2 produces scrambled tiles (xinntao/Real-ESRGAN-ncnn-vulkan#19).
 * Upscale 4× then downscale to the tag target size.
 */
export const REALESRGAN_SCALE = 4
/** Approximate zip size shown in UI (platform packages are ~45–52 MB). */
export const TAG_AI_UPSCALE_DOWNLOAD_SIZE_MB = 50

/** Status only needs “any pending?”, not a full inventory. */
const STATUS_CACHE_TTL_MS = 60_000

const UPSCALER_TIMEOUT_MS = 120_000
const DOWNLOAD_ATTEMPTS = 4
const DOWNLOAD_TIMEOUT_MS = 180_000
const DOWNLOAD_MAX_REDIRECTS = 8
/** Packages are ~45–52 MB; reject truncated caches below this. */
const MIN_ZIP_BYTES = 20 * 1024 * 1024

type PlatformZipKey = 'darwin' | 'win32' | 'linux'

const PLATFORM_ZIP: Record<PlatformZipKey, string> = {
  darwin: `realesrgan-ncnn-vulkan-${REALESRGAN_NCNN_BUILD}-macos.zip`,
  win32: `realesrgan-ncnn-vulkan-${REALESRGAN_NCNN_BUILD}-windows.zip`,
  linux: `realesrgan-ncnn-vulkan-${REALESRGAN_NCNN_BUILD}-ubuntu.zip`,
}

export interface TagImagePendingItem {
  path: string
  metaId: string
  tagId: string
  type: TagAiUpscaleType
  width: number
  height: number
  targetWidth: number
  targetHeight: number
}

export interface TagImageAiUpscaleStatus {
  done: boolean
  pendingCount: number
  byType: Record<string, number>
  downloadSizeMb: number
  suggested: boolean
}

export function isTagImageAiUpscaleDone(db: ApiDb): boolean {
  const row = createSettingsRepository(db.drizzle).findByOption(TAG_IMAGES_AI_UPSCALED_SETTING)
  return parseBooleanSetting(row?.value)
}

export function markTagImageAiUpscaleDone(db: ApiDb): void {
  createSettingsRepository(db.drizzle).upsertByOption(TAG_IMAGES_AI_UPSCALED_SETTING, '1')
  clearTagImageAiUpscaleStatusCache(db.path)
}

function getModelsRoot(db: ApiDb): string {
  return db.path_databases || process.app_folder || projectPath('app_storage')
}

export function getTagUpscaleCacheDir(db: ApiDb): string {
  return path.join(getModelsRoot(db), 'models', 'tag-upscale-tmp')
}

/** Persists across failed runs so a TLS flake does not force a full re-download. */
export function getTagUpscaleZipCacheDir(db: ApiDb): string {
  return path.join(getModelsRoot(db), 'models', 'tag-upscale-cache')
}

export function getRealesrganZipFileName(platform: NodeJS.Platform = process.platform): string {
  const key = (platform === 'darwin' || platform === 'win32' || platform === 'linux')
    ? platform
    : 'linux'
  return PLATFORM_ZIP[key]
}

export function getRealesrganZipUrl(platform: NodeJS.Platform = process.platform): string {
  const file = getRealesrganZipFileName(platform)
  return `https://github.com/xinntao/Real-ESRGAN/releases/download/${REALESRGAN_NCNN_RELEASE}/${file}`
}

export function isTransientDownloadError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  if (
    code === 'ECONNRESET'
    || code === 'ETIMEDOUT'
    || code === 'ECONNREFUSED'
    || code === 'ENOTFOUND'
    || code === 'EAI_AGAIN'
    || code === 'EPIPE'
    || code === 'ECONNABORTED'
    || code === 'UND_ERR_SOCKET'
    || code === 'UND_ERR_CONNECT_TIMEOUT'
  ) {
    return true
  }
  const message = error instanceof Error ? error.message : String(error)
  return /TLS|socket disconnected|socket hang up|network|ECONNRESET|ETIMEDOUT|timed out/i.test(message)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function hasUsableZip(zipPath: string): boolean {
  try {
    return fs.existsSync(zipPath) && fs.statSync(zipPath).size >= MIN_ZIP_BYTES
  } catch {
    return false
  }
}

export function needsTagAiUpscale(
  width: number,
  height: number,
  targetWidth: number,
): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return false
  }
  return Math.max(width, height) < targetWidth
}

function targetHeightFor(width: number, height: number, targetWidth: number): number {
  const aspect = width / height
  if (!Number.isFinite(aspect) || aspect <= 0) return targetWidth
  return Math.max(1, Math.round(targetWidth / aspect))
}

function emptyByType(): Record<string, number> {
  return Object.fromEntries(TAG_AI_UPSCALE_TYPES.map((t) => [t, 0]))
}

type MetaImageFile = {path: string; metaId: string; fileName: string}

type StatusCacheEntry = {
  dbPath: string
  at: number
  value: TagImageAiUpscaleStatus
}

let statusCache: StatusCacheEntry | null = null

export function clearTagImageAiUpscaleStatusCache(dbPath?: string | null): void {
  if (!dbPath || statusCache?.dbPath === dbPath) {
    statusCache = null
  }
}

async function* iterateMetaImageFiles(dbPath: string): AsyncGenerator<MetaImageFile> {
  const metaRoot = path.join(dbPath, 'meta')
  if (!fs.existsSync(metaRoot)) return

  const metaDirs = await readdir(metaRoot, {withFileTypes: true})
  for (const entry of metaDirs) {
    if (!entry.isDirectory()) continue
    const metaId = entry.name
    const dir = path.join(metaRoot, metaId)
    let files: string[]
    try {
      files = await readdir(dir)
    } catch {
      continue
    }
    for (const fileName of files) {
      const parsed = parseTagImageFileName(fileName)
      if (!parsed || !isTagAiUpscaleType(parsed.type)) continue
      yield {path: path.join(dir, fileName), metaId, fileName}
    }
  }
}

/** Fast path: headers only via sharp (no full decode). Falls back to Jimp. */
async function probeImageDimensions(filePath: string): Promise<{width: number; height: number} | null> {
  try {
    const {default: sharp} = await import('sharp')
    const meta = await sharp(filePath).metadata()
    const width = Number(meta.width) || 0
    const height = Number(meta.height) || 0
    if (width <= 0 || height <= 0) return null
    const orientation = typeof meta.orientation === 'number'
      ? meta.orientation
      : await readExifOrientation(filePath)
    return getDisplayDimensions(width, height, orientation)
  } catch {
    try {
      const meta = await getImageMetadata(filePath)
      if (!meta) return null
      return {
        width: Number(meta.width) || 0,
        height: Number(meta.height) || 0,
      }
    } catch {
      return null
    }
  }
}

async function toPendingItem(file: MetaImageFile): Promise<TagImagePendingItem | null> {
  const parsed = parseTagImageFileName(file.fileName)
  if (!parsed || !isTagAiUpscaleType(parsed.type)) return null
  const targetWidth = getTagAiUpscaleTargetWidth(parsed.type)
  if (targetWidth == null) return null

  const dims = await probeImageDimensions(file.path)
  if (!dims) return null
  if (!needsTagAiUpscale(dims.width, dims.height, targetWidth)) return null

  return {
    path: file.path,
    metaId: file.metaId,
    tagId: parsed.tagId,
    type: parsed.type,
    width: dims.width,
    height: dims.height,
    targetWidth,
    targetHeight: targetHeightFor(dims.width, dims.height, targetWidth),
  }
}

export async function hasAnyUpscaleCandidateFiles(dbPath: string): Promise<boolean> {
  for await (const _file of iterateMetaImageFiles(dbPath)) {
    return true
  }
  return false
}

/** Stop after the first undersized tag image (for settings/health status). */
export async function findFirstPendingTagImage(dbPath: string): Promise<TagImagePendingItem | null> {
  for await (const file of iterateMetaImageFiles(dbPath)) {
    const item = await toPendingItem(file)
    if (item) return item
  }
  return null
}

export async function listPendingTagImages(dbPath: string): Promise<TagImagePendingItem[]> {
  const pending: TagImagePendingItem[] = []
  for await (const file of iterateMetaImageFiles(dbPath)) {
    const item = await toPendingItem(file)
    if (item) pending.push(item)
  }
  return pending
}

export type MetaTagAssetCleanupResult = {
  orphansDeleted: number
  foldersRemoved: number
  foldersCreated: number
  imagesResized: number
}

/**
 * Sync meta/ on disk with the DB:
 * - remove meta/{id} folders whose meta id no longer exists
 * - create meta/{id} for every tag category (type = array)
 * - delete tag image files whose tag id is not in the DB
 * - downscale oversized posters (width > 600) and avatars (> 320×320)
 */
export async function cleanupMetaTagAssets(db: ApiDb): Promise<MetaTagAssetCleanupResult> {
  const result: MetaTagAssetCleanupResult = {
    orphansDeleted: 0,
    foldersRemoved: 0,
    foldersCreated: 0,
    imagesResized: 0,
  }

  const dbPath = db.path
  if (!dbPath) return result

  const metaRepo = createMetaRepository(db.drizzle)
  const knownMetaIds = new Set(metaRepo.findAllIds().map((row) => String(row.id)))
  const arrayMetaIds = metaRepo.findArrayIds().map((row) => String(row.id))
  const knownTagIds = new Set(
    createTagsRepository(db.drizzle, db.sqlite).findAllIds().map((row) => String(row.id)),
  )

  const metaRoot = path.join(dbPath, 'meta')
  fs.mkdirSync(metaRoot, {recursive: true})

  let metaDirs: fs.Dirent[]
  try {
    metaDirs = await readdir(metaRoot, {withFileTypes: true})
  } catch {
    return result
  }

  for (const entry of metaDirs) {
    if (!entry.isDirectory()) continue
    if (!/^\d+$/.test(entry.name)) continue
    if (knownMetaIds.has(entry.name)) continue

    const dir = path.join(metaRoot, entry.name)
    try {
      fs.rmSync(dir, {recursive: true, force: true})
      result.foldersRemoved += 1
    } catch {
      // ignore stubborn folders; continue with the rest
    }
  }

  for (const metaId of arrayMetaIds) {
    const dir = path.join(metaRoot, metaId)
    if (fs.existsSync(dir)) continue
    try {
      fs.mkdirSync(dir, {recursive: true})
      result.foldersCreated += 1
    } catch {
      // ignore mkdir failures; continue with the rest
    }
  }

  let remainingDirs: fs.Dirent[]
  try {
    remainingDirs = await readdir(metaRoot, {withFileTypes: true})
  } catch {
    return result
  }

  for (const entry of remainingDirs) {
    if (!entry.isDirectory()) continue
    if (!/^\d+$/.test(entry.name)) continue

    const dir = path.join(metaRoot, entry.name)
    let files: string[]
    try {
      files = await readdir(dir)
    } catch {
      continue
    }

    for (const fileName of files) {
      const parsed = parseTagImageFileName(fileName)
      if (!parsed) continue
      const filePath = path.join(dir, fileName)

      if (!knownTagIds.has(parsed.tagId)) {
        if (unlinkIfExists(filePath)) {
          result.orphansDeleted += 1
        }
        continue
      }

      if (await downscaleTagImageIfNeeded(filePath, parsed.type)) {
        result.imagesResized += 1
      }
    }
  }

  return result
}

export async function downscaleTagImageIfNeeded(
  filePath: string,
  type: string,
): Promise<boolean> {
  const dims = await probeImageDimensions(filePath)
  if (!dims) return false

  const target = getTagImageDownscaleTarget(type, dims.width, dims.height)
  if (!target) return false

  try {
    const buffer = await fs.promises.readFile(filePath)
    await processAndSaveImage({
      buffer,
      outputPath: filePath,
      sizes: target,
    })
    return true
  } catch {
    return false
  }
}

export async function getTagImageAiUpscaleStatus(db: ApiDb): Promise<TagImageAiUpscaleStatus> {
  const done = isTagImageAiUpscaleDone(db)
  if (done) {
    return {
      done: true,
      pendingCount: 0,
      byType: emptyByType(),
      downloadSizeMb: TAG_AI_UPSCALE_DOWNLOAD_SIZE_MB,
      suggested: false,
    }
  }

  const dbPath = db.path
  if (!dbPath) {
    return {
      done: false,
      pendingCount: 0,
      byType: emptyByType(),
      downloadSizeMb: TAG_AI_UPSCALE_DOWNLOAD_SIZE_MB,
      suggested: false,
    }
  }

  const now = Date.now()
  if (
    statusCache
    && statusCache.dbPath === dbPath
    && now - statusCache.at < STATUS_CACHE_TTL_MS
  ) {
    return statusCache.value
  }

  // Status only needs to know whether any old-size image exists.
  const first = await findFirstPendingTagImage(dbPath)
  const byType = emptyByType()
  if (first) {
    byType[first.type] = 1
  }

  const value: TagImageAiUpscaleStatus = {
    done: false,
    // Exact inventory is computed when the upscale stream starts.
    pendingCount: first ? 1 : 0,
    byType,
    downloadSizeMb: TAG_AI_UPSCALE_DOWNLOAD_SIZE_MB,
    suggested: Boolean(first),
  }

  statusCache = {dbPath, at: now, value}
  return value
}

function downloadFileOnce(url: string, destination: string, redirectDepth = 0): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirectDepth > DOWNLOAD_MAX_REDIRECTS) {
      reject(new Error('Too many redirects while downloading Real-ESRGAN package'))
      return
    }

    const client = url.startsWith('https') ? https : http
    const request = client.get(url, {
      headers: {
        'User-Agent': 'mediachips/1.0 (+https://github.com/fupdec/MediaChips)',
        Accept: '*/*',
      },
      timeout: DOWNLOAD_TIMEOUT_MS,
    }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume()
        downloadFileOnce(response.headers.location, destination, redirectDepth + 1).then(resolve, reject)
        return
      }

      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`Failed to download Real-ESRGAN package (HTTP ${response.statusCode})`))
        return
      }

      const tmpPath = `${destination}.download`
      const file = fs.createWriteStream(tmpPath)
      response.pipe(file)
      file.on('finish', () => {
        file.close(() => {
          try {
            const size = fs.statSync(tmpPath).size
            if (size < MIN_ZIP_BYTES) {
              try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
              reject(new Error(`Downloaded Real-ESRGAN package is too small (${size} bytes)`))
              return
            }
            fs.renameSync(tmpPath, destination)
            resolve()
          } catch (error) {
            reject(error)
          }
        })
      })
      file.on('error', (error) => {
        try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
        reject(error)
      })
      response.on('error', (error) => {
        try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
        reject(error)
      })
    })

    request.on('timeout', () => {
      request.destroy(new Error(`Download timed out after ${DOWNLOAD_TIMEOUT_MS / 1000}s`))
    })
    request.on('error', reject)
  })
}

export async function downloadFile(url: string, destination: string): Promise<void> {
  fs.mkdirSync(path.dirname(destination), {recursive: true})
  let lastError: unknown

  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt++) {
    try {
      await downloadFileOnce(url, destination)
      return
    } catch (error) {
      lastError = error
      for (const stale of [`${destination}.download`, destination]) {
        try { fs.unlinkSync(stale) } catch { /* ignore */ }
      }
      if (attempt >= DOWNLOAD_ATTEMPTS || !isTransientDownloadError(error)) {
        break
      }
      await sleep(1000 * attempt * attempt)
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError)
  throw new Error(
    `Failed to download Real-ESRGAN from GitHub after ${DOWNLOAD_ATTEMPTS} attempts `
    + `(VPN/proxy/TLS issues are common). Try again, or briefly disable VPN. (${detail})`,
  )
}

function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

async function extractZip(zipPath: string, dest: string): Promise<void> {
  fs.mkdirSync(dest, {recursive: true})
  const zip = new StreamZip.async({file: zipPath})
  try {
    const entries = await zip.entries()
    for (const entry of Object.values(entries)) {
      const name = String(entry.name || '')
      if (!name || name.endsWith('/')) continue
      const normalized = name.replace(/\\/g, '/')
      if (normalized.includes('..') || path.isAbsolute(normalized)) {
        throw new Error(`Unsafe zip entry: ${name}`)
      }
      const target = path.join(dest, normalized)
      if (!isPathInside(dest, target)) {
        throw new Error(`Unsafe zip entry path: ${name}`)
      }
    }
    await zip.extract(null, dest)
  } finally {
    await zip.close().catch(() => undefined)
  }
}

async function findUpscalerBinary(root: string): Promise<string> {
  const preferredNames = process.platform === 'win32'
    ? ['realesrgan-ncnn-vulkan.exe']
    : ['realesrgan-ncnn-vulkan']

  const stack = [root]
  while (stack.length) {
    const dir = stack.pop()!
    let entries: fs.Dirent[]
    try {
      entries = await readdir(dir, {withFileTypes: true})
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
        continue
      }
      if (preferredNames.includes(entry.name)) {
        return full
      }
    }
  }

  throw new Error('Real-ESRGAN binary not found in downloaded package')
}

async function ensureUpscalerToolchain(db: ApiDb): Promise<{binaryPath: string; workDir: string; zipCacheDir: string}> {
  const workDir = getTagUpscaleCacheDir(db)
  const zipCacheDir = getTagUpscaleZipCacheDir(db)
  await fse.remove(workDir).catch(() => undefined)
  fs.mkdirSync(workDir, {recursive: true})
  fs.mkdirSync(zipCacheDir, {recursive: true})

  const zipName = getRealesrganZipFileName()
  const zipPath = path.join(zipCacheDir, zipName)
  if (!hasUsableZip(zipPath)) {
    await downloadFile(getRealesrganZipUrl(), zipPath)
  }

  const extractDir = path.join(workDir, 'extract')
  await extractZip(zipPath, extractDir)

  const binaryPath = await findUpscalerBinary(extractDir)
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(binaryPath, 0o755)
    } catch {
      // ignore chmod failures; exec may still work
    }
  }

  return {binaryPath, workDir, zipCacheDir}
}

async function upscaleOneImage(
  binaryPath: string,
  item: TagImagePendingItem,
  workDir: string,
): Promise<void> {
  const tmpOut = path.join(
    workDir,
    `out-${item.metaId}-${item.tagId}-${item.type}-${Date.now()}.png`,
  )

  await execFile(
    binaryPath,
    [
      '-i', item.path,
      '-o', tmpOut,
      '-n', REALESRGAN_MODEL_NAME,
      '-s', String(REALESRGAN_SCALE),
    ],
    {
      timeout: UPSCALER_TIMEOUT_MS,
      cwd: path.dirname(binaryPath),
      maxBuffer: 16 * 1024 * 1024,
    },
  )

  if (!fs.existsSync(tmpOut)) {
    throw new Error('Upscaler did not produce an output file')
  }

  const buffer = await fs.promises.readFile(tmpOut)
  await processAndSaveImage({
    buffer,
    outputPath: item.path,
    sizes: {
      width: item.targetWidth,
      height: item.targetHeight,
    },
  })

  await fs.promises.unlink(tmpOut).catch(() => undefined)
}

export async function* iterateTagImageAiUpscale(
  db: ApiDb,
  {
    shouldStop = (): boolean => false,
  }: {shouldStop?: () => boolean} = {},
): AsyncGenerator<Record<string, unknown>> {
  const dbPath = db.path
  if (!dbPath) {
    yield {type: 'error', message: 'Database path is not available'}
    return
  }

  if (isTagImageAiUpscaleDone(db)) {
    yield {type: 'done', skipped: true, processed: 0, total: 0, upscaled: 0, failed: 0}
    return
  }

  clearTagImageAiUpscaleStatusCache(dbPath)
  const pending = await listPendingTagImages(dbPath)
  yield {
    type: 'status',
    pendingCount: pending.length,
    total: pending.length,
  }

  if (pending.length === 0) {
    yield {type: 'cleanup', message: 'Syncing meta folders, orphan images, and oversized tag images'}
    const cleanup = await cleanupMetaTagAssets(db)
    markTagImageAiUpscaleDone(db)
    yield {
      type: 'done',
      skipped: true,
      processed: 0,
      total: 0,
      upscaled: 0,
      failed: 0,
      ...cleanup,
    }
    return
  }

  let workDir: string | null = null
  let zipCacheDir: string | null = null
  let upscaled = 0
  let failed = 0
  let processed = 0
  let aborted = false
  let completed = false

  try {
    yield {
      type: 'downloading',
      message: 'Downloading Real-ESRGAN toolchain',
      downloadSizeMb: TAG_AI_UPSCALE_DOWNLOAD_SIZE_MB,
    }

    const toolchain = await ensureUpscalerToolchain(db)
    workDir = toolchain.workDir
    zipCacheDir = toolchain.zipCacheDir

    if (shouldStop()) {
      aborted = true
      yield {type: 'aborted', processed, total: pending.length, upscaled, failed}
      return
    }

    yield {type: 'ready', total: pending.length}

    for (const item of pending) {
      if (shouldStop()) {
        aborted = true
        break
      }

      try {
        await upscaleOneImage(toolchain.binaryPath, item, workDir)
        upscaled += 1
        yield {
          type: 'item',
          status: 'upscaled',
          path: item.path,
          typeName: item.type,
          processed: processed + 1,
          total: pending.length,
          upscaled,
          failed,
        }
      } catch (error: unknown) {
        failed += 1
        yield {
          type: 'item',
          status: 'failed',
          path: item.path,
          typeName: item.type,
          message: error instanceof Error ? error.message : String(error),
          processed: processed + 1,
          total: pending.length,
          upscaled,
          failed,
        }
      }

      processed += 1
      yield {
        type: 'progress',
        processed,
        total: pending.length,
        upscaled,
        failed,
        path: item.path,
      }
    }

    if (aborted) {
      yield {type: 'aborted', processed, total: pending.length, upscaled, failed}
      return
    }

    yield {type: 'cleanup', message: 'Syncing meta folders, orphan images, and oversized tag images'}
    const cleanup = await cleanupMetaTagAssets(db)

    markTagImageAiUpscaleDone(db)
    completed = true
    yield {
      type: 'done',
      skipped: false,
      processed,
      total: pending.length,
      upscaled,
      failed,
      ...cleanup,
    }
  } catch (error: unknown) {
    yield {
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
      processed,
      total: pending.length,
      upscaled,
      failed,
    }
  } finally {
    if (workDir) {
      await fse.remove(workDir).catch(() => undefined)
    }
    // Keep zip on failure/abort so the next attempt can skip GitHub.
    if (completed && zipCacheDir) {
      await fse.remove(zipCacheDir).catch(() => undefined)
    }
  }
}
