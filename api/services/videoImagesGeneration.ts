import type { ApiDb } from '../types/db'
import type {
  FfprobeDurationInfo,
  VideoGridOptions,
  VideoImageGenerationOptions,
  VideoImageGenerationProgressEvent,
  VideoImageGenerationResult,
  VideoImageItem,
  VideoImagesGenerationStatus,
  VideoImageType,
  VideoImageTypeStatus,
} from '../types/videoImagesGeneration'
import fs from 'fs'
import { readdir } from 'fs/promises'
import os from 'os'
import path from 'path'
import {
  combineVideoFrames,
  extractVideoFrame,
  extractVideoThumbnail,
  ffprobe,
  getVideoStreamDimensions,
} from '../utils/ffmpeg'
import { resolveExistingPath } from './contentHash'
import { createMediaRepository } from '../db/repositories/media'
import { createMediaTypesRepository } from '../db/repositories/mediaTypes'
import { createMarksRepository } from '../db/repositories/marks'
import {
  VIDEO_GRID_JPEG_QUALITY,
  VIDEO_GRID_SPRITE,
  VIDEO_MARK_HEIGHT,
  VIDEO_MARK_JPEG_QUALITY,
  VIDEO_THUMB_HEIGHT,
  VIDEO_THUMB_JPEG_QUALITY,
  getGridSpriteDimensions,
} from '../../shared/videoPreview'

async function getVideoMediaTypeId(db: ApiDb) {
  const mediaTypesRepo = createMediaTypesRepository(db.drizzle)
  const videoType = mediaTypesRepo.findByType('video')
  return videoType?.id || null
}

const IMAGE_TYPES: VideoImageType[] = ['preview', 'grid', 'marks']

const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => Promise.race([
  promise,
  new Promise<T>((_, reject) => {
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  }),
])

const formatMarkTimestamp = (time: number) => new Date(1000 * time).toISOString().substr(11, 12)

const getPreviewPath = (dbPath: string, id: unknown) => path.join(dbPath, 'media/videos/thumbs', `${id}.jpg`)
const getGridPath = (dbPath: string, id: unknown) => path.join(dbPath, 'media/videos/grids', `${id}.jpg`)
const getMarkPath = (dbPath: string, id: unknown) => path.join(dbPath, 'media/videos/marks', `${id}.jpg`)

const ensureDir = (dirPath: string) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, {recursive: true})
  }
}

function hasGeneratedImage(dbPath: string, imageType: VideoImageType, item: VideoImageItem) {
  switch (imageType) {
    case 'preview':
      return fs.existsSync(getPreviewPath(dbPath, item.id))
    case 'grid':
      return fs.existsSync(getGridPath(dbPath, item.id))
    case 'marks':
      return fs.existsSync(getMarkPath(dbPath, item.id))
    default:
      return false
  }
}

function createPreviewImage(pathToFile: string, id: unknown, dbPath: string) {
  const thumbsDir = path.join(dbPath, 'media/videos/thumbs')
  ensureDir(thumbsDir)
  const outputPath = getPreviewPath(dbPath, id)
  return withTimeout(
    extractVideoThumbnail({
      input: pathToFile,
      outputPath,
      height: VIDEO_THUMB_HEIGHT,
      jpegQuality: VIDEO_THUMB_JPEG_QUALITY,
    }),
    120000,
    'ffmpeg thumbnail',
  )
}

function createMarkImage(timestamp: string, inputPath: string, outputPath: string) {
  return extractVideoFrame({
    input: inputPath,
    output: outputPath,
    timestamp,
    vf: `scale=-1:${VIDEO_MARK_HEIGHT}`,
    jpegQuality: VIDEO_MARK_JPEG_QUALITY,
  })
}

class VideoGrid {
  dbPath: string
  tmpDir: string
  input: string
  output: string
  cols: number
  rows: number
  width: number
  tileCount: number
  gridsPath: string

  constructor(opts: VideoGridOptions, dbPath: string) {
    this.dbPath = dbPath
    this.tmpDir = os.tmpdir()
    this.input = opts.input
    this.output = opts.output
    this.cols = opts.cols
    this.rows = opts.rows
    this.width = opts.width
    this.tileCount = this.rows * this.cols
    this.gridsPath = path.join(dbPath, 'media/videos/grids')
    ensureDir(this.gridsPath)
  }

  async getVideoInfo(pathToFile: string) {
    const info = await ffprobe(pathToFile)
    const {aspectRatio} = getVideoStreamDimensions(info)

    return {
      duration: (info as FfprobeDurationInfo).format.duration,
      aspectRatio,
    }
  }

  makeLayout(i: number) {
    const currentColumn = i % this.cols
    const currentRow = Math.floor(i / this.cols)
    const colSide: string[] = []
    const rowSide: string[] = []
    if (currentColumn === 0) colSide.push('0')
    else for (let j = 0; j < currentColumn; j++) colSide.push('w0')
    if (currentRow === 0) rowSide.push('0')
    else for (let k = 0; k < currentRow; k++) rowSide.push('h0')
    return `${colSide.join('+')}_${rowSide.join('+')}`
  }

  ffmpegSeekP(timestamp: string, intermediateOutput: string) {
    return extractVideoFrame({
      input: this.input,
      output: intermediateOutput,
      timestamp,
    }).then((output: unknown) => new Promise((resolve) => {
      setTimeout(() => resolve(output), 500)
    }))
  }

  ffmpegCombineP(
    inputFiles: string[],
    streams: string[],
    layouts: string[],
    spriteWidth: number,
    spriteHeight: number,
  ) {
    return combineVideoFrames({
      inputs: inputFiles,
      filterComplex: `${streams.join('')}xstack=inputs=${this.tileCount}:layout=${layouts.join('|')}[v];[v]scale=${spriteWidth}:${spriteHeight}:flags=lanczos[scaled]`,
      output: path.join(this.gridsPath, this.output),
      jpegQuality: VIDEO_GRID_JPEG_QUALITY,
    })
  }

  async generate() {
    const {duration, aspectRatio} = await this.getVideoInfo(this.input)
    if (typeof duration !== 'number') return false

    const sprite = getGridSpriteDimensions(aspectRatio, this.cols, this.rows)
    const durSlice = parseInt(String(duration / this.tileCount), 10)

    const framePromises: Promise<unknown>[] = []
    for (let i = 0; i < this.tileCount; i++) {
      const timestamp = new Date(1000 * (i + 0.5) * durSlice).toISOString().substr(11, 8)
      const intermediateOutput = path.join(this.tmpDir, `thumb${i}.png`)
      framePromises.push(this.ffmpegSeekP(timestamp, intermediateOutput))
    }

    await Promise.all(framePromises).catch(() => {})

    const inputFiles: string[] = []
    const streams: string[] = []
    const layouts: string[] = []
    for (let l = 0; l < this.tileCount; l++) {
      inputFiles.push(path.join(this.tmpDir, `thumb${l}.png`))
      streams.push(`[${l}:v]`)
      layouts.push(this.makeLayout(l))
    }

    await this.ffmpegCombineP(inputFiles, streams, layouts, sprite.width, sprite.height)
    return {output: this.output}
  }
}

async function generateVideoImage(
  dbPath: string,
  imageType: VideoImageType,
  item: VideoImageItem,
  {force = false}: { force?: boolean } = {},
): Promise<VideoImageGenerationResult> {
  if (!force && hasGeneratedImage(dbPath, imageType, item)) {
    return {status: 'skipped', id: item.id, path: item.path || item.media?.path}
  }

  const videoPath = imageType === 'marks'
    ? (item.media?.path || item.Media?.path)
    : item.path

  if (!videoPath) {
    return {status: 'missing', id: item.id, path: videoPath}
  }

  const resolvedPath = await resolveExistingPath(videoPath)
  if (!resolvedPath) {
    return {status: 'missing', id: item.id, path: videoPath}
  }

  try {
    switch (imageType) {
      case 'preview':
        await createPreviewImage(resolvedPath, item.id, dbPath)
        break
      case 'grid': {
        const gridPath = getGridPath(dbPath, item.id)
        if (force && fs.existsSync(gridPath)) fs.unlinkSync(gridPath)
        const grid = new VideoGrid({
          input: resolvedPath,
          output: `${item.id}.jpg`,
          width: VIDEO_GRID_SPRITE.tileWidth,
          cols: VIDEO_GRID_SPRITE.cols,
          rows: VIDEO_GRID_SPRITE.rows,
        }, dbPath)
        await grid.generate()
        break
      }
      case 'marks': {
        const marksDir = path.join(dbPath, 'media/videos/marks')
        ensureDir(marksDir)
        const outputPath = getMarkPath(dbPath, item.id)
        if (force && fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
        await createMarkImage(formatMarkTimestamp(Number(item.time)), resolvedPath, outputPath)
        break
      }
      default:
        throw new Error(`Unknown image type: ${imageType}`)
    }

    return {status: 'created', id: item.id, path: videoPath}
  } catch (error: unknown) {
    return {
      status: 'failed',
      id: item.id,
      path: videoPath,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

const GENERATED_DIR_BY_TYPE: Record<VideoImageType, string> = {
  preview: 'media/videos/thumbs',
  grid: 'media/videos/grids',
  marks: 'media/videos/marks',
}

function buildStatus(total: number, generated: number): VideoImageTypeStatus {
  return {
    total,
    generated,
    pending: Math.max(total - generated, 0),
  }
}

function countGenerated(items: Array<{ id?: unknown }>, existingIds: Set<string>) {
  let generated = 0

  for (const item of items) {
    if (existingIds.has(String(item.id))) generated += 1
  }

  return generated
}

async function loadGeneratedIdSet(dbPath: string, imageType: VideoImageType): Promise<Set<string>> {
  const relativeDir = GENERATED_DIR_BY_TYPE[imageType]
  if (!relativeDir) return new Set()

  const dirPath = path.join(dbPath, relativeDir)
  if (!fs.existsSync(dirPath)) return new Set()

  const files = await readdir(dirPath)
  const ids = new Set<string>()

  for (const file of files) {
    if (file.endsWith('.jpg')) {
      ids.add(file.slice(0, -4))
    }
  }

  return ids
}

async function getVideoImagesGenerationStatus(db: ApiDb, dbPath: string): Promise<VideoImagesGenerationStatus> {
  const mediaRepo = createMediaRepository(db.drizzle)
  const marksRepo = createMarksRepository(db.drizzle)
  const videoTypeId = await getVideoMediaTypeId(db)
  const [
    previewIds,
    gridIds,
    markImageIds,
    videoRows,
    markRows,
  ] = await Promise.all([
    loadGeneratedIdSet(dbPath, 'preview'),
    loadGeneratedIdSet(dbPath, 'grid'),
    loadGeneratedIdSet(dbPath, 'marks'),
    Promise.resolve(videoTypeId ? mediaRepo.findIdsByMediaType(videoTypeId) : []),
    Promise.resolve(marksRepo.findAllIds()),
  ])

  const videoTotal = videoRows.length
  const marksTotal = markRows.length

  return {
    preview: buildStatus(videoTotal, countGenerated(videoRows as Array<{ id?: unknown }>, previewIds)),
    grid: buildStatus(videoTotal, countGenerated(videoRows as Array<{ id?: unknown }>, gridIds)),
    marks: buildStatus(marksTotal, countGenerated(markRows as Array<{ id?: unknown }>, markImageIds)),
  }
}

async function* iterateVideoImagesGeneration(
  db: ApiDb,
  dbPath: string,
  imageType: VideoImageType,
  {
    shouldStop = () => false,
    force = false,
  }: VideoImageGenerationOptions = {},
): AsyncGenerator<VideoImageGenerationProgressEvent> {
  const mediaRepo = createMediaRepository(db.drizzle)
  const marksRepo = createMarksRepository(db.drizzle)

  if (!IMAGE_TYPES.includes(imageType)) {
    yield {type: 'error', message: `Unknown image type: ${imageType}`}
    return
  }

  let total = 0
  if (imageType === 'marks') {
    total = marksRepo.countAll()
  } else {
    const videoTypeId = await getVideoMediaTypeId(db)
    if (!videoTypeId) {
      yield {type: 'complete', processed: 0, total: 0, created: 0, skipped: 0, missing: 0, failed: 0}
      return
    }
    total = mediaRepo.countByMediaType(videoTypeId)
  }

  let processed = 0
  let created = 0
  let skipped = 0
  let missing = 0
  let failed = 0
  let lastId = 0

  yield {
    type: 'progress',
    processed,
    total,
    remaining: total,
    created,
    skipped,
    missing,
    failed,
  }

  while (!shouldStop()) {
    let item: VideoImageItem | null = null

    if (imageType === 'marks') {
      const markRow = marksRepo.findNextWithMediaAfterId(lastId)
      if (!markRow) break
      item = {
        ...markRow,
        media: markRow.media || undefined,
      } as VideoImageItem
    } else {
      const videoTypeId = await getVideoMediaTypeId(db)
      item = mediaRepo.findNextByMediaTypeAfterId(Number(videoTypeId), lastId) as VideoImageItem | null
      if (!item) break
    }

    lastId = Number(item.id)

    if (!force && hasGeneratedImage(dbPath, imageType, item)) {
      processed += 1
      skipped += 1
      yield {
        type: 'progress',
        processed,
        total,
        remaining: Math.max(total - processed, 0),
        created,
        skipped,
        missing,
        failed,
        current: item.path || item.media?.path,
        lastStatus: 'skipped',
      }
      continue
    }

    const result = await generateVideoImage(dbPath, imageType, item, {force})
    processed += 1

    if (result.status === 'created') created += 1
    else if (result.status === 'skipped') skipped += 1
    else if (result.status === 'missing') missing += 1
    else failed += 1

    yield {
      type: 'progress',
      processed,
      total,
      remaining: Math.max(total - processed, 0),
      created,
      skipped,
      missing,
      failed,
      current: result.path,
      lastStatus: result.status,
    }
  }

  yield {
    type: 'complete',
    processed,
    total,
    created,
    skipped,
    missing,
    failed,
    stopped: shouldStop(),
  }
}

export {
  IMAGE_TYPES,
  generateVideoImage,
  getVideoImagesGenerationStatus,
  iterateVideoImagesGeneration,
}
