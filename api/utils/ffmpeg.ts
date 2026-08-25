import { spawn } from 'child_process'
import {
  runWithFfmpegLimit,
  runWithFfprobeLimit,
  runWithRemuxLimit,
  runWithConversionLimit,
} from '../services/mediaPostProcessQueue'
import { getFfmpegPath, getFfprobePath } from './ffmpegPaths'
import {
  acceptKeyframeHit,
  isUsableDuration,
  normalizeFfprobePayload,
  pickBestKeyframeFromPackets,
  pickBestKeyframePts,
  pickLastPtsFromCsv,
  resolveThumbnailSeekSeconds,
  type FfprobePayload,
} from './ffprobeMath'

export {
  getVideoStreamDimensions,
  normalizeFfprobePayload,
  resolveThumbnailSeekSeconds,
} from './ffprobeMath'

export type ConversionProgressDetails = {
  mediaSeconds: number
  speed?: number
  etaSeconds?: number
}

type RunProcessOptions = {
  signal?: AbortSignal
  duration?: number
  onProgress?: (progress: number, details?: ConversionProgressDetails) => void
}

/** FFmpeg's out_time_ms field is historically expressed in microseconds. */
export function parseFfmpegProgressTime(line: string): number | null {
  const match = line.match(/^out_time_(?:us|ms)=(\d+)/)
  if (match) return Number(match[1]) / 1_000_000
  const timestamp = line.match(/^out_time=(\d+):(\d+):(\d+(?:\.\d+)?)/)
  if (timestamp) return Number(timestamp[1]) * 3600 + Number(timestamp[2]) * 60 + Number(timestamp[3])
  return null
}

function runProcess(binary: string, args: string[], options: RunProcessOptions = {}): Promise<{stdout: string; stderr: string}> {
  return new Promise((resolve, reject) => {
    const proc = spawn(binary, args, {stdio: ['ignore', 'pipe', 'pipe']})
    let stdout = ''
    let stderr = ''
    let progressBuffer = ''
    let settled = false
    let aborted = false
    let killTimer: ReturnType<typeof setTimeout> | undefined
    let lastMediaSeconds = 0
    const startedAt = Date.now()

    const finishReject = (error: Error) => {
      if (settled) return
      settled = true
      if (killTimer) clearTimeout(killTimer)
      reject(error)
    }
    const abort = () => {
      if (settled || aborted) return
      aborted = true
      proc.kill('SIGTERM')
      killTimer = setTimeout(() => {
        if (!settled) proc.kill('SIGKILL')
      }, 2_000)
    }

    if (options.signal?.aborted) {
      abort()
      return
    }
    options.signal?.addEventListener('abort', abort, {once: true})

    proc.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString()
    })
    proc.stderr?.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString()
      stderr += text
      progressBuffer += text
      const lines = progressBuffer.split(/\r?\n/)
      progressBuffer = lines.pop() || ''
      let mediaSeconds = lastMediaSeconds
      let speed: number | undefined
      for (const line of lines) {
        const parsedTime = parseFfmpegProgressTime(line)
        if (parsedTime != null) mediaSeconds = parsedTime
        const speedMatch = line.match(/^speed=([0-9.]+)x/)
        if (speedMatch) speed = Number(speedMatch[1])
      }
      if (mediaSeconds > lastMediaSeconds && options.duration && options.duration > 0) {
        lastMediaSeconds = mediaSeconds
        const measuredSpeed = speed && speed > 0 ? speed : (mediaSeconds / Math.max(0.001, (Date.now() - startedAt) / 1000))
        const etaSeconds = measuredSpeed > 0 ? Math.max(0, (options.duration - mediaSeconds) / measuredSpeed) : undefined
        options.onProgress?.(Math.max(0, Math.min(98, mediaSeconds / options.duration * 100)), {mediaSeconds, speed: measuredSpeed, etaSeconds})
      }
    })
    proc.on('error', (error) => finishReject(error))
    proc.on('close', (code: number | null) => {
      options.signal?.removeEventListener('abort', abort)
      if (settled) return
      settled = true
      if (killTimer) clearTimeout(killTimer)
      if (aborted) {
        reject(new Error('Conversion cancelled'))
        return
      }
      if (code === 0) {
        options.onProgress?.(100)
        resolve({stdout, stderr})
        return
      }
      const lines = stderr.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
      const meaningful = lines.filter((line) => !line.startsWith('frame=') && !line.includes('out_time_') && !line.startsWith('progress='))
      const detail = meaningful.slice(-8).join('\n') || `${binary} exited with code ${code}`
      reject(new Error(detail))
    })
  })
}

async function ffprobe(filePath: string) {
  return runWithFfprobeLimit(async () => {
    const {stdout} = await runProcess(getFfprobePath(), [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePath,
    ])

    return normalizeFfprobePayload(JSON.parse(stdout) as FfprobePayload)
  })
}

/**
 * Chrome/WebM (and some live recordings) often omit format.duration.
 * Seek near EOF by file percentage and read the last packet pts_time.
 */
async function ffprobeDurationFromPackets(filePath: string): Promise<number | null> {
  return runWithFfprobeLimit(async () => {
    const readLastPts = async (streamSpec: string) => {
      const {stdout} = await runProcess(getFfprobePath(), [
        '-v',
        'error',
        '-select_streams',
        streamSpec,
        '-show_entries',
        'packet=pts_time',
        '-of',
        'csv=p=0',
        '-read_intervals',
        '99%',
        filePath,
      ])
      return pickLastPtsFromCsv(stdout)
    }

    try {
      const videoPts = await readLastPts('v:0')
      if (videoPts != null) return videoPts
    } catch {
      // Fall through to audio packets.
    }

    try {
      return await readLastPts('a:0')
    } catch {
      return null
    }
  })
}

/** Container duration when present; otherwise last packet PTS near EOF. */
async function resolveFfprobeDuration(
  filePath: string,
  formatDuration?: number | null,
): Promise<number | null> {
  if (isUsableDuration(Number(formatDuration))) {
    return Number(formatDuration)
  }
  return ffprobeDurationFromPackets(filePath)
}

/**
 * Last video keyframe at or before `targetSeconds`.
 * Used for accurate mid-file seeks without decoding from t=0.
 */
async function findPreviousKeyframeTime(
  filePath: string,
  targetSeconds: number,
  lookbackSeconds = 600,
): Promise<number | null> {
  return runWithFfprobeLimit(async () => {
    const target = Math.max(0, Number(targetSeconds) || 0)
    if (target <= 0.05) return 0

    const windowStart = Math.max(0, target - Math.max(30, lookbackSeconds))
    const windowDuration = Math.ceil(target - windowStart + 2)
    const interval = `${windowStart}%+${windowDuration}`

    const fromFrames = async () => {
      const {stdout} = await runProcess(getFfprobePath(), [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-skip_frame', 'nokey',
        '-show_entries', 'frame=pts_time',
        '-of', 'csv=p=0',
        '-read_intervals', interval,
        filePath,
      ])
      return pickBestKeyframePts(stdout, target)
    }

    const fromPackets = async () => {
      const {stdout} = await runProcess(getFfprobePath(), [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'packet=pts_time,flags',
        '-of', 'csv=p=0',
        '-read_intervals', interval,
        filePath,
      ])
      return pickBestKeyframeFromPackets(stdout, target)
    }

    try {
      const frameKey = await fromFrames()
      // Empty ffprobe lines parse as 0; ignore a bogus t=0 hit for mid-file targets.
      const accepted = acceptKeyframeHit(frameKey, target)
      if (accepted != null) {
        return accepted
      }
    } catch {
      // Fall through to packet scan.
    }

    try {
      return await fromPackets()
    } catch {
      return null
    }
  })
}

/**
 * Faster codec-only probe for playability checks.
 * Bounded demuxer window keeps large files quick, but wide enough that
 * moov/codecs are usually visible. Callers should fall back to full ffprobe
 * when the result looks incomplete.
 */
async function ffprobePlayability(filePath: string) {
  return runWithFfprobeLimit(async () => {
    const {stdout} = await runProcess(getFfprobePath(), [
      '-v',
      'quiet',
      '-probesize',
      '5000000',
      '-analyzeduration',
      '5000000',
      '-show_entries',
      'stream=codec_type,codec_name:format=duration',
      '-of',
      'json',
      filePath,
    ])

    return normalizeFfprobePayload(JSON.parse(stdout) as FfprobePayload)
  })
}

async function runFfmpeg(args: string[], options: RunProcessOptions = {}) {
  return runWithFfmpegLimit(() => runProcess(getFfmpegPath(), args, options))
}

/** Progressive remux / background copy — must not block live playback ffmpeg. */
async function runFfmpegBackground(args: string[]) {
  return runWithRemuxLimit(() => runProcess(getFfmpegPath(), args))
}

const SINGLE_IMAGE_EXT = /\.(jpe?g|png|webp|bmp|gif)$/i

/** image2 requires -update for a single still without a %03d sequence pattern (FFmpeg 6+). */
function pushSingleImageOutput(args: string[], output: string, options?: {overwrite?: boolean}) {
  if (SINGLE_IMAGE_EXT.test(output)) {
    args.push('-update', '1')
  }
  if (options?.overwrite !== false) {
    args.push('-y')
  }
  args.push(output)
}

async function extractVideoFrame({
  input,
  output,
  timestamp,
  vf,
  jpegQuality,
}: {
  input: string
  output: string
  timestamp?: string
  vf?: string
  jpegQuality?: number
}) {
  const args: string[] = []

  if (timestamp) {
    args.push('-ss', timestamp)
  }

  args.push('-i', input, '-frames:v', '1')

  if (vf) {
    args.push('-vf', vf)
  }

  if (jpegQuality != null && /\.jpe?g$/i.test(output)) {
    args.push('-q:v', String(jpegQuality))
  }

  pushSingleImageOutput(args, output)
  await runFfmpeg(args)
  return output
}

async function extractVideoThumbnail({
  input,
  outputPath,
  height = 320,
  seekRatio = 0.5,
  jpegQuality,
}: {
  input: string
  outputPath: string
  height?: number
  seekRatio?: number
  jpegQuality?: number
}) {
  let seekSeconds = 1

  try {
    const {format} = await ffprobe(input)
    const duration = await resolveFfprobeDuration(input, format.duration)
    seekSeconds = resolveThumbnailSeekSeconds(duration, seekRatio)
  } catch {
    // Skip the common all-black first frame when metadata is unavailable.
  }

  const args = [
    '-ss',
    String(seekSeconds),
    '-i',
    input,
    '-vf',
    `scale=-1:${height}`,
    '-frames:v',
    '1',
  ]

  if (jpegQuality != null && /\.jpe?g$/i.test(outputPath)) {
    args.push('-q:v', String(jpegQuality))
  }

  pushSingleImageOutput(args, outputPath)
  await runFfmpeg(args)
  return outputPath
}

/** Extract embedded album art / attached picture as a JPEG cover thumb. */
async function extractAudioCoverArt({
  input,
  outputPath,
  height = 320,
  jpegQuality = 4,
}: {
  input: string
  outputPath: string
  height?: number
  jpegQuality?: number
}) {
  const args = [
    '-i',
    input,
    '-an',
    '-map',
    '0:v:0',
    '-vf',
    `scale=-1:${height}`,
    '-frames:v',
    '1',
    '-q:v',
    String(jpegQuality),
  ]
  pushSingleImageOutput(args, outputPath)
  await runFfmpeg(args)
  return outputPath
}

async function combineVideoFrames({
  inputs,
  filterComplex,
  output,
  mapLabel = '[scaled]',
  jpegQuality,
}: {
  inputs: string[]
  filterComplex: string
  output: string
  mapLabel?: string
  jpegQuality?: number
}) {
  const args = ['-y']

  for (const input of inputs) {
    args.push('-i', input)
  }

  args.push('-filter_complex', filterComplex, '-map', mapLabel)

  if (jpegQuality != null && /\.jpe?g$/i.test(output)) {
    args.push('-q:v', String(jpegQuality))
  }

  pushSingleImageOutput(args, output, {overwrite: false})
  await runFfmpeg(args)
}

async function cutVideoSegment({
  input,
  outputPath,
  startSeconds,
  durationSeconds,
}: {
  input: string
  outputPath: string
  startSeconds: number
  durationSeconds: number
}) {
  const start = Math.max(0, Number(startSeconds) || 0)
  const duration = Math.max(0.05, Number(durationSeconds) || 0)
  const copyArgs = [
    '-y',
    '-ss', String(start),
    '-i', input,
    '-t', String(duration),
    '-c', 'copy',
    '-avoid_negative_ts', 'make_zero',
    outputPath,
  ]

  try {
    await runFfmpeg(copyArgs)
    return outputPath
  } catch {
    await runFfmpeg([
      '-y',
      '-ss', String(start),
      '-i', input,
      '-t', String(duration),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      outputPath,
    ])
    return outputPath
  }
}

async function concatVideoSegments({
  segmentPaths,
  outputPath,
  listFilePath,
}: {
  segmentPaths: string[]
  outputPath: string
  listFilePath: string
}) {
  const {writeFile} = await import('fs/promises')
  const listBody = segmentPaths
    .map((filePath) => `file '${String(filePath).replace(/'/g, `'\\''`)}'`)
    .join('\n')
  await writeFile(listFilePath, listBody, 'utf8')

  try {
    await runFfmpeg([
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', listFilePath,
      '-c', 'copy',
      '-movflags', '+faststart',
      outputPath,
    ])
    return outputPath
  } catch {
    await runFfmpeg([
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', listFilePath,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      outputPath,
    ])
    return outputPath
  }
}


export type ConversionResolution = 'original' | 2160 | 1080 | 720 | 480
export type ConversionQuality = 'economy' | 'balanced' | 'quality'
export type ConversionCodec = 'hevc' | 'h264'

const QUALITY_OPTIONS: Record<ConversionQuality, {crf: number; preset: string; hardwareQuality: number}> = {
  economy: {crf: 28, preset: 'veryfast', hardwareQuality: 70},
  balanced: {crf: 24, preset: 'fast', hardwareQuality: 55},
  quality: {crf: 20, preset: 'medium', hardwareQuality: 40},
}

/** Hardware encoding is opt-in because availability varies by OS, GPU, driver, and FFmpeg build. */
export function shouldUseHardwareVideoEncoder(): boolean {
  return process.env.MEDIA_CHIPS_USE_HARDWARE_VIDEO_ENCODING === '1'
}

export function resolveConversionVideoEncoder(codec: ConversionCodec): 'libx265' | 'libx264' | 'hevc_videotoolbox' | 'h264_videotoolbox' {
  if (shouldUseHardwareVideoEncoder() && process.platform === 'darwin') {
    return codec === 'hevc' ? 'hevc_videotoolbox' : 'h264_videotoolbox'
  }
  return codec === 'hevc' ? 'libx265' : 'libx264'
}

/** Builds a capped scale expression. It never enlarges a source video. */
export function buildConversionScale(resolution: ConversionResolution): string | null {
  if (resolution === 'original') return null
  const height = Number(resolution)
  if (![2160, 1080, 720, 480].includes(height)) throw new Error('Unsupported conversion resolution')
  return `scale=-2:min(${height}\\,ih):force_original_aspect_ratio=decrease`
}

export function buildConversionArgs(input: string, output: string, options: {
  codec: ConversionCodec
  resolution: ConversionResolution
  quality: ConversionQuality
  duration?: number
}): string[] {
  const profile = QUALITY_OPTIONS[options.quality]
  if (!profile) throw new Error('Unsupported conversion quality')
  const args = ['-hide_banner', '-y']
  if (options.duration != null) args.push('-t', String(Math.max(0.1, options.duration)))
  args.push('-progress', 'pipe:2', '-nostats', '-i', input, '-map', '0:v:0', '-map', '0:a?', '-sn', '-dn')
  const scale = buildConversionScale(options.resolution)
  if (scale) args.push('-vf', scale)
  const encoder = resolveConversionVideoEncoder(options.codec)
  args.push('-c:v', encoder)
  if (encoder.endsWith('videotoolbox')) {
    args.push('-q:v', String(profile.hardwareQuality))
    if (options.codec === 'h264') args.push('-profile:v', 'high')
    if (options.codec === 'hevc') args.push('-tag:v', 'hvc1')
  } else {
    args.push('-preset', profile.preset, '-crf', String(profile.crf))
  }
  args.push('-pix_fmt', 'yuv420p')
  args.push('-c:a', 'aac', '-profile:a', 'aac_low', '-b:a', '128k', '-movflags', '+faststart', '-f', 'mp4', output)
  return args
}

export async function convertVideoFile(input: string, output: string, options: {
  codec: ConversionCodec
  resolution: ConversionResolution
  quality: ConversionQuality
  duration?: number
  onProgress?: (progress: number, details?: ConversionProgressDetails) => void
  signal?: AbortSignal
}): Promise<string> {
  if (options.signal?.aborted) throw new Error('Conversion cancelled')
  return runWithConversionLimit(async () => {
    const args = buildConversionArgs(input, output, options)
    await runFfmpeg(args, {
      signal: options.signal,
      duration: options.duration,
      onProgress: options.onProgress,
    })
    if (options.signal?.aborted) throw new Error('Conversion cancelled')
    return output
  })
}

export {
  ffprobe,
  ffprobePlayability,
  ffprobeDurationFromPackets,
  resolveFfprobeDuration,
  findPreviousKeyframeTime,
  runFfmpeg,
  runFfmpegBackground,
  extractVideoFrame,
  extractVideoThumbnail,
  extractAudioCoverArt,
  combineVideoFrames,
  cutVideoSegment,
  concatVideoSegments,
}
