import type {
  FfprobeDurationInfo,
  VideoGridOptions,
} from '../types/videoImagesGeneration'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  combineVideoFrames,
  extractVideoFrame,
  ffprobe,
  getVideoStreamDimensions,
} from '../utils/ffmpeg'
import {
  VIDEO_GRID_JPEG_QUALITY,
  buildGridCombineInputs,
  getGridSpriteDimensions,
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
 */
export class VideoGrid {
  tmpDir: string
  input: string
  output: string
  cols: number
  rows: number
  tileCount: number
  gridsPath: string

  constructor(opts: VideoGridOptions, dbPath: string) {
    this.tmpDir = os.tmpdir()
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

  async generate(): Promise<{output: string} | false> {
    const {duration, aspectRatio} = await this.getVideoInfo(this.input)
    if (typeof duration !== 'number') return false

    const sprite = getGridSpriteDimensions(aspectRatio, this.cols, this.rows)
    const {timestamps} = planGridTileTimestamps(duration, this.tileCount)

    const framePromises: Promise<unknown>[] = []
    for (let i = 0; i < this.tileCount; i++) {
      const intermediateOutput = path.join(this.tmpDir, `thumb${i}.png`)
      framePromises.push(this.ffmpegSeekP(timestamps[i], intermediateOutput))
    }

    // Partial tile failures are tolerated; combine may still succeed.
    await Promise.all(framePromises).catch(() => {})

    const {inputFiles, streams, layouts} = buildGridCombineInputs(
      this.tmpDir,
      this.tileCount,
      this.cols,
      path.join,
    )

    await this.ffmpegCombineP(inputFiles, streams, layouts, sprite.width, sprite.height)
    return {output: this.output}
  }
}

export async function generateVideoGrid(
  opts: VideoGridOptions,
  dbPath: string,
): Promise<{output: string} | false> {
  return new VideoGrid(opts, dbPath).generate()
}
