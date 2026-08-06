/** Detect-time frame sampling: fingerprint, duration, diverse extract. */

import type {FaceDetectorMediaItem, FaceDetectorOptions} from '../types/faceDetector'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {extractVideoFrame, ffprobe} from '../utils/ffmpeg'
import {
  averageHashFromLumaValues,
  computeOversampledFrameCount,
  getFrameTimestamps,
  pickDiverseFrames,
} from './faceDetectorMath'
import {FACE_CROP_FRAME_WIDTH} from './faceCropStore'
import {mapInOrderedBatches} from './orderedAsyncBatches'

/** Pipeline fingerprint work while the next ffmpeg extract queues. */
export const FACE_FRAME_EXTRACT_CONCURRENCY = 2

export function collectLumaValuesFromRgba(
  data: Uint8Array | Buffer | number[],
  width: number,
  height: number,
): number[] {
  const values: number[] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      values.push(data[(y * width + x) * 4])
    }
  }
  return values
}

async function frameFingerprintWithSharp(framePath: string): Promise<string> {
  const {default: sharp} = await import('sharp')
  // 8×8 greyscale raw → same aHash input as the Jimp path.
  const {data, info} = await sharp(framePath)
    .resize(8, 8, {fit: 'fill'})
    .greyscale()
    .raw()
    .toBuffer({resolveWithObject: true})

  const values: number[] = []
  for (let i = 0; i < data.length; i += info.channels) {
    values.push(data[i])
  }
  return averageHashFromLumaValues(values)
}

/** Average-hash fingerprint for cheap near-duplicate frame rejection. */
export async function frameFingerprint(framePath: string): Promise<string> {
  return frameFingerprintWithSharp(framePath)
}

export async function getVideoDuration(filePath: string) {
  const info = await ffprobe(filePath)
  const duration = Number(info?.format?.duration || 0)
  if (!duration) throw new Error('Video duration is unavailable.')
  return duration
}

export function unlinkUnselectedFrameFiles(
  candidates: Array<{framePath: string}>,
  selected: Array<{framePath: string}>,
) {
  const selectedPaths = new Set(selected.map((frame) => frame.framePath))
  for (const candidate of candidates) {
    if (selectedPaths.has(candidate.framePath)) continue
    try {
      fs.unlinkSync(candidate.framePath)
    } catch {
      // Ignore cleanup errors.
    }
  }
}

export async function extractFramesForMedia(
  item: FaceDetectorMediaItem,
  options: FaceDetectorOptions & {
    shouldStop?: () => boolean
    extractConcurrency?: number
  } = {},
) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediachips-faces-'))
  const frames: Array<{framePath: string; timestamp: string}> = []
  const frameWidth = Number(options.frameWidth || FACE_CROP_FRAME_WIDTH)
  const framesPerVideo = Number(options.framesPerVideo || 6)
  const shouldStop = options.shouldStop || (() => false)
  const extractConcurrency = Math.max(
    1,
    options.extractConcurrency ?? FACE_FRAME_EXTRACT_CONCURRENCY,
  )

  if (!item?.path || !fs.existsSync(String(item.path))) {
    return {tmpDir, frames}
  }

  let duration: number
  try {
    duration = await getVideoDuration(String(item.path))
  } catch {
    return {tmpDir, frames}
  }

  // Oversample then drop near-duplicates so N kept frames cover more of the video.
  const {targetCount, candidateCount} = computeOversampledFrameCount(framesPerVideo)
  const timestamps = getFrameTimestamps(duration, candidateCount)

  const extracted = await mapInOrderedBatches(
    timestamps,
    extractConcurrency,
    async (timestamp, index) => {
      const output = path.join(tmpDir, `${item.id || 'media'}_${index}.jpg`)
      await extractVideoFrame({
        input: String(item.path),
        output,
        timestamp,
        vf: `scale=${frameWidth}:-1`,
      })
      const fingerprint = await frameFingerprint(output)
      return {framePath: output, timestamp, fingerprint}
    },
    {shouldStop},
  )

  const candidates = extracted.filter(
    (entry): entry is {framePath: string; timestamp: string; fingerprint: string} => (
      Boolean(entry)
    ),
  )

  if (shouldStop()) {
    unlinkUnselectedFrameFiles(candidates, [])
    return {tmpDir, frames}
  }

  const selected = pickDiverseFrames(candidates, targetCount)
  unlinkUnselectedFrameFiles(candidates, selected)

  for (const frame of selected) {
    frames.push({framePath: frame.framePath, timestamp: frame.timestamp})
  }

  return {tmpDir, frames}
}
