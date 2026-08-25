import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { convertVideoFile, ffprobe, resolveFfprobeDuration, type ConversionCodec, type ConversionQuality, type ConversionResolution } from '../utils/ffmpeg'
import { createMediaRepository } from '../db/repositories/media'
import { parseMediaFilePath } from '../../shared/mediaPath'
import { invalidateMediaDerivedCaches } from './mediaCacheInvalidation'
import type { ApiDb } from '../types/db'

type Input = { id: number; path: string }
type RequestedCodec = ConversionCodec | 'auto'
type Options = { codec: RequestedCodec; resolution: ConversionResolution; quality: ConversionQuality; destination: string; deleteOriginal?: boolean }
export type ConversionItem = Input & { status: string; progress: number; etaSeconds?: number; speed?: number; estimatedSizeBytes?: number; outputSizeBytes?: number; outputPath?: string; codec?: ConversionCodec; fallback?: boolean; error?: string; warning?: string }
export type ConversionJob = { id: string; status: string; items: ConversionItem[]; createdAt: number }
export type ConversionOptions = Options
const jobs = new Map<string, ConversionJob>()
const controllers = new Map<string, AbortController>()

function uniqueOutput(destination: string, source: string, codec: ConversionCodec): string {
  const parsed = path.parse(source)
  const stem = `${parsed.name}_${codec.toUpperCase()}`
  let n = 1
  let candidate = path.join(destination, `${stem}.mp4`)
  while (fs.existsSync(candidate)) candidate = path.join(destination, `${stem}_${++n}.mp4`)
  return candidate
}

async function probeInput(source: string) {
  const probe = await ffprobe(source)
  const video = probe.streams?.find((stream) => stream.codec_type === 'video')
  if (!video) throw new Error('Source is not a usable video')
  return {probe}
}

function estimateOutputSizeBytes(sourceSizeBytes: number, sourceHeight: number, resolution: ConversionResolution, codec: ConversionCodec, quality: ConversionQuality): number {
  const targetHeight = resolution === 'original' ? sourceHeight : Math.min(sourceHeight, Number(resolution))
  const dimensionFactor = sourceHeight > 0 ? Math.min(1, (targetHeight / sourceHeight) ** 1.5) : 1
  const codecFactor = codec === 'hevc' ? 0.62 : 0.82
  const qualityFactor = {economy: 0.72, balanced: 1, quality: 1.35}[quality]
  return Math.max(1, Math.round(sourceSizeBytes * dimensionFactor * codecFactor * qualityFactor))
}

function validateOutput(filePath: string, probe: Awaited<ReturnType<typeof ffprobe>>, codec: ConversionCodec) {
  const video = probe.streams?.find((stream) => stream.codec_type === 'video')
  const audio = probe.streams?.find((stream) => stream.codec_type === 'audio')
  const formatName = String((probe.format as Record<string, unknown> | undefined)?.format_name || '')
  const duration = Number(probe.format?.duration)
  if (!formatName.split(',').includes('mp4')) throw new Error('Converted file is not an MP4')
  if (!video || video.codec_name !== codec) throw new Error(`Converted file is not ${codec}`)
  if (audio && audio.codec_name !== 'aac') throw new Error('Converted audio is not AAC')
  if (!Number.isFinite(duration) || duration <= 0 || !fs.statSync(filePath).size) throw new Error('Converted file has no usable duration or size')
}

async function processItem(db: ApiDb, job: ConversionJob, item: ConversionItem, options: Options, signal: AbortSignal) {
  item.status = 'running'; item.progress = 0
  const source = item.path
  if (!fs.existsSync(source)) throw new Error('Source file not found')
  try {
    fs.accessSync(source, fs.constants.R_OK)
  } catch {
    throw new Error('Source file is not readable. On macOS, grant the server terminal or Node Full Disk Access / Files and Folders permission.')
  }
  const inputProbe = await probeInput(source)
  const duration = await resolveFfprobeDuration(source, inputProbe.probe.format?.duration)
  if (!duration || duration <= 0) throw new Error('Source has no usable duration')
  const sourceVideo = inputProbe.probe.streams?.find((stream) => stream.codec_type === 'video')
  item.estimatedSizeBytes = estimateOutputSizeBytes(
    fs.statSync(source).size,
    Number(sourceVideo?.height) || 0,
    options.resolution,
    options.codec === 'auto' ? 'h264' : options.codec,
    options.quality,
  )
  fs.mkdirSync(options.destination, {recursive: true})
  try {
    fs.accessSync(options.destination, fs.constants.W_OK)
  } catch {
    throw new Error('Destination folder is not writable. Check the folder permissions and macOS Files and Folders access.')
  }

  const codecs: ConversionCodec[] = options.codec === 'auto' ? ['hevc', 'h264'] : [options.codec]
  let lastError: unknown = null
  for (let attempt = 0; attempt < codecs.length; attempt += 1) {
    const codec = codecs[attempt]
    const output = uniqueOutput(options.destination, source, codec)
    const temp = `${output}.${randomUUID()}.part`
    try {
      await convertVideoFile(source, temp, {
        codec,
        resolution: options.resolution,
        quality: options.quality,
        duration,
        onProgress: (progress, details) => { item.progress = progress; item.etaSeconds = details?.etaSeconds; item.speed = details?.speed },
        signal,
      })
      const probe = await ffprobe(temp)
      validateOutput(temp, probe, codec)
      fs.renameSync(temp, output)
      let originalDeleted = false
      if (options.deleteOriginal) {
        try {
          fs.unlinkSync(source)
          originalDeleted = true
        } catch {
          item.warning = 'Converted, but original could not be deleted'
        }
      }
      if (originalDeleted) {
        const repo = createMediaRepository(db.drizzle)
        const parsed = parseMediaFilePath(output)
        repo.updateById(item.id, parsed, {silent: true})
        invalidateMediaDerivedCaches()
      }
      item.outputPath = output
      item.outputSizeBytes = fs.statSync(output).size
      item.codec = codec
      item.fallback = attempt > 0
      item.progress = 100
      item.status = 'done'
      return
    } catch (error) {
      lastError = error
      if (fs.existsSync(temp)) fs.unlinkSync(temp)
      if (signal.aborted) throw new Error('Conversion cancelled')
      if (attempt + 1 >= codecs.length) throw error
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError || 'Conversion failed'))
}

export function startVideoConversion(db: ApiDb, inputs: Input[], options: Options): ConversionJob {
  if (!inputs.length) throw new Error('At least one video is required')
  if (!['auto', 'hevc', 'h264'].includes(options.codec)) throw new Error('Unsupported conversion codec')
  if (!['original', 2160, 1080, 720, 480].includes(options.resolution as any)) throw new Error('Unsupported conversion resolution')
  if (!['economy', 'balanced', 'quality'].includes(options.quality)) throw new Error('Unsupported conversion quality')
  if (!path.isAbsolute(options.destination)) throw new Error('Destination must be an absolute path')
  const job: ConversionJob = { id: randomUUID(), status: 'queued', items: inputs.map((i) => ({...i, status: 'queued', progress: 0})), createdAt: Date.now() }
  jobs.set(job.id, job)
  const controller = new AbortController(); controllers.set(job.id, controller)
  void (async () => {
    job.status = 'running'
    for (const item of job.items) {
      if (controller.signal.aborted) { item.status = 'cancelled'; continue }
      try { await processItem(db, job, item, options, controller.signal) }
      catch (error) { item.status = controller.signal.aborted ? 'cancelled' : 'error'; item.error = error instanceof Error ? error.message : String(error) }
    }
    job.status = controller.signal.aborted ? 'cancelled' : 'done'; controllers.delete(job.id)
  })()
  return job
}
export function getVideoConversionJob(id: string) { return jobs.get(id) || null }
export function cancelVideoConversion(id: string) { const c = controllers.get(id); if (!c) return false; c.abort(); return true }
export function cancelAllVideoConversions() {
  let cancelled = 0
  for (const controller of controllers.values()) { controller.abort(); cancelled += 1 }
  return cancelled
}
export { uniqueOutput }
