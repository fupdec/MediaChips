import type {
  FfprobeDurationInfo,
  VideoGridOptions,
} from '../types/videoImagesGeneration'
import fs from 'fs'
import path from 'path'
import {
  runFfmpeg,
  ffprobe,
  getVideoStreamDimensions,
} from '../utils/ffmpeg'
import {
  VIDEO_GRID_JPEG_QUALITY,
  getGridSpriteDimensions,
  makeXstackLayout,
  planGridTileTimestamps,
} from '../../shared/videoPreview'

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, {recursive: true})
  }
}

/**
 * Shared 3×3 (or custom) contact-sheet generator for interactive createGrid
 * and bulk video image generation.
 *
 * Uses a single ffmpeg process (N seeks of the same file + xstack) instead of
 * 9 serial extract jobs + combine — critical while ffmpeg concurrency is 1.
 */
export class VideoGrid {
  input: string
  output: string
  cols: number
  rows: number
  tileCount: number
  gridsPath: string

  constructor(opts: VideoGridOptions, dbPath: string) {
    this.input = opts.input
    this.output = opts.output
    this.cols = opts.cols
    this.rows = opts.rows
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

  async generate(): Promise<{output: string} | false> {
    const {duration, aspectRatio} = await this.getVideoInfo(this.input)
    if (typeof duration !== 'number') return false

    const sprite = getGridSpriteDimensions(aspectRatio, this.cols, this.rows)
    const {timestamps} = planGridTileTimestamps(duration, this.tileCount)
    const outPath = path.join(this.gridsPath, this.output)
    const {tileWidth, tileHeight} = sprite

    const args: string[] = ['-hide_banner', '-loglevel', 'error', '-y']
    for (const timestamp of timestamps) {
      // Place -ss before -i for fast keyframe seek (same as extractVideoFrame).
      args.push('-ss', timestamp, '-i', this.input)
    }

    const scales: string[] = []
    const stackPads: string[] = []
    const layouts: string[] = []
    for (let i = 0; i < this.tileCount; i++) {
      scales.push(
        `[${i}:v]scale=${tileWidth}:${tileHeight}:force_original_aspect_ratio=decrease,` +
          `pad=${tileWidth}:${tileHeight}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}]`,
      )
      stackPads.push(`[v${i}]`)
      layouts.push(makeXstackLayout(i, this.cols))
    }

    const filterComplex =
      `${scales.join(';')};` +
      `${stackPads.join('')}xstack=inputs=${this.tileCount}:layout=${layouts.join('|')}[v]`

    args.push(
      '-filter_complex', filterComplex,
      '-map', '[v]',
      '-frames:v', '1',
      '-q:v', String(VIDEO_GRID_JPEG_QUALITY),
      outPath,
    )

    // runFfmpeg already holds the global ffmpeg slot (re-entrant).
    await runFfmpeg(args)
    return {output: this.output}
  }
}

export async function generateVideoGrid(
  opts: VideoGridOptions,
  dbPath: string,
): Promise<{output: string} | false> {
  return new VideoGrid(opts, dbPath).generate()
}
