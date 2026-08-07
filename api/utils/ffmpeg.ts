import { spawn } from 'child_process'
import {
  runWithFfmpegLimit,
  runWithFfprobeLimit,
  runWithRemuxLimit,
} from '../services/mediaPostProcessQueue'
import { getFfmpegPath, getFfprobePath } from './ffmpegPaths'
import {
  acceptKeyframeHit,
  normalizeFfprobePayload,
  pickBestKeyframeFromPackets,
  pickBestKeyframePts,
  resolveThumbnailSeekSeconds,
  type FfprobePayload,
} from './ffprobeMath'

export {
  getVideoStreamDimensions,
  normalizeFfprobePayload,
  resolveThumbnailSeekSeconds,
} from './ffprobeMath'

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

async function runFfmpeg(args: string[]) {
  return runWithFfmpegLimit(() => runProcess(getFfmpegPath(), args))
}

/** Progressive remux / background copy — must not block live playback ffmpeg. */
async function runFfmpegBackground(args: string[]) {
  return runWithRemuxLimit(() => runProcess(getFfmpegPath(), args))
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

export {
  ffprobe,
  ffprobePlayability,
  findPreviousKeyframeTime,
  runFfmpeg,
  runFfmpegBackground,
  extractVideoFrame,
  extractVideoThumbnail,
  combineVideoFrames,
  cutVideoSegment,
  concatVideoSegments,
}
