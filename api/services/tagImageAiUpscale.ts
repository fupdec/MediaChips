import type { ApiDb } from '../types/db'
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
import {
  getDisplayDimensions,
  getImageMetadata,
  processAndSaveImage,
  readExifOrientation,
} from './imageMedia'
import {
  TAG_AI_UPSCALE_TYPES,
  getTagAiUpscaleTargetWidth,
  isTagAiUpscaleType,
  parseTagImageFileName,
  type TagAiUpscaleType,
} from '../../shared/tagImages'

const execFile = promisify(execFileCb)

export const TAG_IMAGES_AI_UPSCALED_SETTING = 'migrations.tagImagesAiUpscaled'

/** Portable Real-ESRGAN ncnn-vulkan release (includes binary + models). */
export const REALESRGAN_NCNN_RELEASE = 'v0.2.5.0'
export const REALESRGAN_NCNN_BUILD = '20220424'
export const REALESRGAN_MODEL_NAME = 'realesrgan-x4plus'
export const REALESRGAN_SCALE = 2
/** Approximate zip size shown in UI (platform packages are ~45–52 MB). */
export const TAG_AI_UPSCALE_DOWNLOAD_SIZE_MB = 50

/** Status only needs “any pending?”, not a full inventory. */
const STATUS_CACHE_TTL_MS = 60_000

const UPSCALER_TIMEOUT_MS = 120_000

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

function parseBooleanSetting(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  return String(value).toLowerCase() === 'true' || String(value) === '1'
}

export function isTagImageAiUpscaleDone(db: ApiDb): boolean {
  const row = createSettingsRepository(db.drizzle).findByOption(TAG_IMAGES_AI_UPSCALED_SETTING)
  return parseBooleanSetting(row?.value)
}

export function markTagImageAiUpscaleDone(db: ApiDb): void {
  createSettingsRepository(db.drizzle).upsertByOption(TAG_IMAGES_AI_UPSCALED_SETTING, '1')
  clearTagImageAiUpscaleStatusCache(db.path)
}

export function getTagUpscaleCacheDir(db: ApiDb): string {
  const base = db.path_databases || process.app_folder || path.join(__dirname, '../../app_storage')
  return path.join(base, 'models', 'tag-upscale-tmp')
}

export function getRealesrganZipUrl(platform: NodeJS.Platform = process.platform): string {
  const key = (platform === 'darwin' || platform === 'win32' || platform === 'linux')
    ? platform
    : 'linux'
  const file = PLATFORM_ZIP[key]
  return `https://github.com/xinntao/Real-ESRGAN/releases/download/${REALESRGAN_NCNN_RELEASE}/${file}`
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

function downloadFile(url: string, destination: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    const request = client.get(url, {
      headers: {
        'User-Agent': 'mediachips/1.0 (+https://github.com/fupdec/MediaChips)',
      },
    }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume()
        downloadFile(response.headers.location, destination).then(resolve, reject)
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
    })

    request.on('error', reject)
  })
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

async function ensureUpscalerToolchain(db: ApiDb): Promise<{binaryPath: string; workDir: string}> {
  const workDir = getTagUpscaleCacheDir(db)
  await fse.remove(workDir).catch(() => undefined)
  fs.mkdirSync(workDir, {recursive: true})

  const zipName = path.basename(getRealesrganZipUrl())
  const zipPath = path.join(workDir, zipName)
  await downloadFile(getRealesrganZipUrl(), zipPath)

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

  return {binaryPath, workDir}
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
    markTagImageAiUpscaleDone(db)
    yield {type: 'done', skipped: true, processed: 0, total: 0, upscaled: 0, failed: 0}
    return
  }

  let workDir: string | null = null
  let upscaled = 0
  let failed = 0
  let processed = 0
  let aborted = false

  try {
    yield {
      type: 'downloading',
      message: 'Downloading Real-ESRGAN toolchain',
      downloadSizeMb: TAG_AI_UPSCALE_DOWNLOAD_SIZE_MB,
    }

    const toolchain = await ensureUpscalerToolchain(db)
    workDir = toolchain.workDir

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

    markTagImageAiUpscaleDone(db)
    yield {
      type: 'done',
      skipped: false,
      processed,
      total: pending.length,
      upscaled,
      failed,
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
  }
}
