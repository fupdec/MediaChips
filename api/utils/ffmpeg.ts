import { spawn } from 'child_process'
import { getFfmpegPath, getFfprobePath } from './ffmpegPaths'

interface FfprobeStream {
  codec_type?: string
  codec_name?: string
  width?: number | string
  height?: number | string
  nb_frames?: number | string
  [key: string]: unknown
}

interface FfprobePayload {
  format?: {
    duration?: number | string
    bit_rate?: number | string
    [key: string]: unknown
  }
  streams?: FfprobeStream[]
}

function runProcess(binary: string, args: string[]): Promise<{stdout: string; stderr: string}> {
  return new Promise((resolve, reject) => {
    const proc = spawn(binary, args, {stdio: ['ignore', 'pipe', 'pipe']})
    let stdout = ''
    let stderr = ''

    proc.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString()
    })
    proc.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString()
    })
    proc.on('error', reject)
    proc.on('close', (code: number | null) => {
      if (code === 0) {
        resolve({stdout, stderr})
        return
      }

      reject(new Error(stderr.trim() || `${binary} exited with code ${code}`))
    })
  })
}

function normalizeFfprobePayload(data: FfprobePayload) {
  const format = {
    ...(data.format || {}),
    duration: Number(data.format?.duration || 0),
    bit_rate: data.format?.bit_rate,
  }

  const streams = (data.streams || []).map((stream) => ({
    ...stream,
    width: stream.width != null ? Number(stream.width) : undefined,
    height: stream.height != null ? Number(stream.height) : undefined,
    nb_frames: stream.nb_frames != null ? Number(stream.nb_frames) : undefined,
  }))

  return {format, streams}
}

async function ffprobe(filePath: string) {
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
}

/**
 * Faster codec-only probe for playability checks.
 * Bounded demuxer window keeps large files quick, but wide enough that
 * moov/codecs are usually visible. Callers should fall back to full ffprobe
 * when the result looks incomplete.
 */
async function ffprobePlayability(filePath: string) {
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
}

function getVideoStreamDimensions(
  probe: {streams?: FfprobeStream[]},
  fallbackAspectRatio = 16 / 9,
) {
  const videoStream = probe.streams?.find((stream) => stream.codec_type === 'video')
  const width = Number(videoStream?.width) || 0
  const height = Number(videoStream?.height) || 0

  if (width > 0 && height > 0) {
    return {
      width,
      height,
      aspectRatio: width / height,
    }
  }

  return {
    width: 0,
    height: 0,
    aspectRatio: fallbackAspectRatio,
  }
}

async function runFfmpeg(args: string[]) {
  return runProcess(getFfmpegPath(), args)
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

  args.push('-y', output)
  await runFfmpeg(args)
  return output
}

function resolveThumbnailSeekSeconds(duration: number | string | null | undefined, seekRatio = 0.5) {
  const normalizedDuration = Number(duration || 0)

  if (!Number.isFinite(normalizedDuration) || normalizedDuration <= 0.1) {
    return 1
  }

  const seekSeconds = normalizedDuration * seekRatio
  return Math.min(
    Math.max(seekSeconds, 0),
    Math.max(normalizedDuration - 0.1, 0),
  )
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
    seekSeconds = resolveThumbnailSeekSeconds(format.duration, seekRatio)
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

  args.push('-y', outputPath)
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

  args.push(output)
  await runFfmpeg(args)
}

export {
  ffprobe,
  ffprobePlayability,
  runFfmpeg,
  extractVideoFrame,
  extractVideoThumbnail,
  combineVideoFrames,
  resolveThumbnailSeekSeconds,
  getVideoStreamDimensions,
}
