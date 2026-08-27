import fs from 'fs'
import path from 'path'
import {randomUUID} from 'crypto'
import {
  ffprobe,
  resolveFfprobeDuration,
  trimVideoFile,
} from '../utils/ffmpeg'
import {createMediaRepository} from '../db/repositories/media'
import {createVideoMetadataRepository} from '../db/repositories/videoMetadata'
import {parseMediaFilePath} from '../../shared/mediaPath'
import {isVirtualZipPath} from '../../shared/zipPath'
import {
  allocateUniqueMediaPath,
  canApplyTrim,
  normalizeTrimRange,
} from '../../shared/playerTrim'
import {invalidateMediaDerivedCaches} from './mediaCacheInvalidation'
import {unlinkResolvedPath} from './localAssetCleanup'
import type {ApiDb} from '../types/db'

type TrimInput = {
  id: number
  path: string
  startSeconds: number
  endSeconds: number
}

export type VideoTrimJob = {
  id: string
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled'
  mediaId: number
  originalPath: string
  outputPath?: string
  startSeconds: number
  endSeconds: number
  progress: number
  fallback?: boolean
  error?: string
  createdAt: number
}

export type VideoTrimDeleteResult = {
  id: number
  path: string
  basename: string
  name: string
  ext: string
  duration?: number
  filesize?: number
}

const jobs = new Map<string, VideoTrimJob>()
const controllers = new Map<string, AbortController>()

function allocateTrimOutputPath(source: string): string {
  const parsed = path.parse(source)
  return allocateUniqueMediaPath(
    parsed.dir,
    `${parsed.name}_TRIM`,
    parsed.ext,
    (filePath) => fs.existsSync(filePath),
    path.join,
  )
}

async function processTrim(job: VideoTrimJob, signal: AbortSignal): Promise<void> {
  job.status = 'running'
  job.progress = 0
  const source = job.originalPath
  if (!fs.existsSync(source)) throw new Error('Source file not found')
  if (isVirtualZipPath(source)) throw new Error('Files inside ZIP archives cannot be trimmed')

  const probe = await ffprobe(source)
  const sourceDuration = await resolveFfprobeDuration(source, probe.format?.duration)
  if (!sourceDuration || sourceDuration <= 0) throw new Error('Source has no usable duration')

  const range = normalizeTrimRange(job.startSeconds, job.endSeconds, sourceDuration)
  if (!canApplyTrim(range.start, range.end, sourceDuration)) {
    throw new Error('Choose a start and end inside the video')
  }

  job.startSeconds = range.start
  job.endSeconds = range.end

  const output = allocateTrimOutputPath(source)
  const parsedOutput = path.parse(output)
  const temp = path.join(parsedOutput.dir, `.mc-trim-${randomUUID()}${parsedOutput.ext || '.mp4'}`)
  try {
    const result = await trimVideoFile(source, temp, {
      startSeconds: range.start,
      durationSeconds: range.duration,
      signal,
      onProgress: (progress) => { job.progress = progress },
    })
    const resultExt = path.extname(result.outputPath) || parsedOutput.ext
    const destPath = resultExt.toLowerCase() === parsedOutput.ext.toLowerCase()
      ? output
      : allocateUniqueMediaPath(
        parsedOutput.dir,
        parsedOutput.name,
        resultExt,
        (filePath) => fs.existsSync(filePath),
        path.join,
      )
    fs.renameSync(result.outputPath, destPath)
    job.outputPath = destPath
    job.fallback = result.fallback
    job.progress = 100
    job.status = 'done'
  } catch (error) {
    if (fs.existsSync(temp)) {
      try { fs.unlinkSync(temp) } catch { /* ignore */ }
    }
    throw error
  }
}

export function startVideoTrim(db: ApiDb, input: TrimInput): VideoTrimJob {
  const mediaRepo = createMediaRepository(db.drizzle)
  const media = mediaRepo.findById(input.id)
  if (!media) throw new Error(`Media ${input.id} not found`)
  if (String(media.path) !== input.path) throw new Error(`Media path mismatch for ${input.id}`)
  if (isVirtualZipPath(input.path)) throw new Error('Files inside ZIP archives cannot be trimmed')

  const job: VideoTrimJob = {
    id: randomUUID(),
    status: 'queued',
    mediaId: input.id,
    originalPath: input.path,
    startSeconds: input.startSeconds,
    endSeconds: input.endSeconds,
    progress: 0,
    createdAt: Date.now(),
  }
  jobs.set(job.id, job)
  const controller = new AbortController()
  controllers.set(job.id, controller)

  void (async () => {
    try {
      await processTrim(job, controller.signal)
    } catch (error) {
      job.status = controller.signal.aborted ? 'cancelled' : 'error'
      job.error = error instanceof Error ? error.message : String(error)
      if (controller.signal.aborted && job.error === 'Conversion cancelled') {
        job.error = 'Trim cancelled'
      }
    } finally {
      controllers.delete(job.id)
    }
  })()

  return job
}

export function getVideoTrimJob(id: string): VideoTrimJob | null {
  return jobs.get(id) || null
}

export function cancelVideoTrim(id: string): boolean {
  const controller = controllers.get(id)
  if (!controller) return false
  controller.abort()
  return true
}

export async function deleteTrimOriginal(
  db: ApiDb,
  input: {id: number; originalPath: string; trimmedPath: string},
): Promise<VideoTrimDeleteResult> {
  const mediaRepo = createMediaRepository(db.drizzle)
  const videoMetadataRepo = createVideoMetadataRepository(db.drizzle)
  const media = mediaRepo.findById(input.id)
  if (!media) throw new Error(`Media ${input.id} not found`)

  const currentPath = String(media.path || '')
  const originalPath = String(input.originalPath || '')
  const trimmedPath = String(input.trimmedPath || '')
  if (!trimmedPath || !fs.existsSync(trimmedPath)) {
    throw new Error('Trimmed file not found')
  }
  if (currentPath !== originalPath && currentPath !== trimmedPath) {
    throw new Error(`Media path mismatch for ${input.id}`)
  }

  const parsed = parseMediaFilePath(trimmedPath)
  const filesize = fs.statSync(trimmedPath).size
  const probe = await ffprobe(trimmedPath)
  const duration = await resolveFfprobeDuration(trimmedPath, probe.format?.duration)

  if (originalPath && originalPath !== trimmedPath && fs.existsSync(originalPath)) {
    const deleted = await unlinkResolvedPath(originalPath)
    if (!deleted && fs.existsSync(originalPath)) {
      throw new Error('Original file could not be deleted')
    }
  }

  mediaRepo.updateById(input.id, {
    ...parsed,
    filesize,
    contentHash: '',
    oshash: '',
    visualHash: '',
    visualHashTiles: '',
  })
  if (duration && duration > 0) {
    videoMetadataRepo.updateByMediaId(input.id, {duration})
  }
  invalidateMediaDerivedCaches()

  return {
    id: input.id,
    path: parsed.path,
    basename: parsed.basename,
    name: parsed.name,
    ext: parsed.ext,
    duration: duration || undefined,
    filesize,
  }
}
