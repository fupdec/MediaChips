import type { TaskControllerShared } from '../../types/tasks'
import type { ApiRequest, ApiResponse } from '../../types/http'
import type {
  FfprobeDurationInfo,
  VideoGridOptions,
} from '../../types/videoImagesGeneration'
import { createMarksRepository } from '../../db/repositories/marks'
import { createMediaRepository } from '../../db/repositories/media'
import os from 'os'
import fs from 'fs'
import { downloadRemoteImage } from '../../services/remoteImageDownload'
import path from 'path'
import {
  combineVideoFrames,
  extractVideoFrame,
  ffprobe,
  getVideoStreamDimensions,
} from '../../utils/ffmpeg'
import { resolveExistingPath } from '../../services/contentHash'
import { resolveActiveDbFilePath } from '../../services/mediaPathResolver'
import { buildVideoGridTaskParams, getGridSpriteDimensions, VIDEO_GRID_JPEG_QUALITY, VIDEO_MARK_HEIGHT, VIDEO_MARK_JPEG_QUALITY } from '../../../shared/videoPreview'

const formatMarkTimestamp = (time: number) => new Date(1000 * time).toISOString().substr(11, 12)

export default function createTasksVideoPreviewController(shared: TaskControllerShared) {
  const {db, dbPath, createThumbMiddle, createThumbCustom, getImageMedia} = shared
  const marksRepo = createMarksRepository(db.drizzle)
  const mediaRepo = createMediaRepository(db.drizzle)

  const createThumbForVideo = async function (req: ApiRequest, res: ApiResponse) {
    createThumbMiddle(req.body.path, req.body.id)
      .then((result: string) => {
        res.status(201).send(result)
      })
      .catch((e: unknown) => {
        res.status(400).send(e)
      })
  }

  const createThumb = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const resolvedInputPath = resolveActiveDbFilePath(req.body.inputPath, dbPath)
      if (!resolvedInputPath) {
        res.status(400).send({
          message: "The video does not exist."
        })
        return
      }

      const outputPath = req.body.outputPath
      if (!outputPath) {
        res.status(400).send({
          message: "No output path provided."
        })
        return
      }

      const outputExists = await resolveExistingPath(outputPath)
      if (!req.body.overwrite && outputExists) {
        res.status(400).send({
          message: "The image already exists."
        })
        return
      }

      const outputDir = path.dirname(outputPath)
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, {recursive: true})
      }

      const thumbResult = await createThumbCustom(
        req.body.timestamp,
        resolvedInputPath,
        outputPath,
        req.body.width,
      )
      res.status(201).send(thumbResult)
    } catch (e) {
      res.status(400).send(e)
    }
  }

  const createGrid = async function (req: ApiRequest, res: ApiResponse) {
    const gridsPath = path.join(dbPath ?? '', '/media/videos/grids/')

    if (!fs.existsSync(req.body.input)) {
      res.status(400).send({
        message: "The video does not exist."
      })
      return
    }

    class Grid {
      tmpDir: string
      input: string
      output: string
      cols: number
      rows: number
      width: number
      tileCount: number

      constructor(opts: VideoGridOptions) {
        this.tmpDir = os.tmpdir()
        this.input = opts.input
        this.output = opts.output
        this.cols = opts.cols
        this.rows = opts.rows
        this.width = opts.width
        this.tileCount = this.rows * this.cols
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
        else
          for (let j = 0; j < currentColumn; j++) colSide.push('w0')
        if (currentRow === 0) rowSide.push('0')
        else
          for (let k = 0; k < currentRow; k++) rowSide.push('h0')
        return `${colSide.join('+')}_${rowSide.join('+')}`
      }

      async ffmpegSeekP(timestamp: string, intermediateOutput: string) {
        return extractVideoFrame({
          input: this.input,
          output: intermediateOutput,
          timestamp,
        }).then((output: unknown) => new Promise((resolve) => {
          setTimeout(() => {
            resolve(output)
          }, 500)
        }))
      }

      async ffmpegCombineP(
        inputFiles: string[],
        streams: string[],
        layouts: string[],
        spriteWidth: number,
        spriteHeight: number,
      ) {
        return combineVideoFrames({
          inputs: inputFiles,
          filterComplex: `${streams.join('')}xstack=inputs=${this.tileCount}:layout=${layouts.join('|')}[v];[v]scale=${spriteWidth}:${spriteHeight}:flags=lanczos[scaled]`,
          output: path.join(gridsPath, this.output),
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

        await Promise.all(framePromises)
          .catch((_err: unknown) => {
            // console.log(_err)
          })

        const inputFiles: string[] = []
        const streams: string[] = []
        const layouts: string[] = []
        for (let l = 0; l < this.tileCount; l++) {
          inputFiles.push(`${this.tmpDir}/thumb${l}.png`)
          streams.push(`[${l}:v]`)
          layouts.push(this.makeLayout(l))
        }
        await this.ffmpegCombineP(inputFiles, streams, layouts, sprite.width, sprite.height)
          .catch((err: unknown) => {
            console.log(err)
          })

        return {
          output: this.output
        }
      }
    }

    const gridPath = path.join(gridsPath, req.body.output);
    if (!fs.existsSync(gridPath)) {
      const grid = new Grid(req.body)
      const result = await grid.generate()
      if (result) {
        res.status(201).send(result)
      } else {
        res.status(400).send({
          message: 'Grid already exists'
        });
      }
    } else {
      res.status(400).send({
        message: 'Grid already exists'
      });
    }
  }

  const createTimeline = async function (req: ApiRequest, res: ApiResponse) {
    const resolvedVideoPath = await resolveExistingPath(req.body.path)
    if (!resolvedVideoPath) {
      res.status(400).send({message: 'The video does not exist.'})
      return
    }

    req.body = {
      ...req.body,
      ...buildVideoGridTaskParams(resolvedVideoPath, `${req.body.id}.jpg`),
    }
    return createGrid(req, res)
  }

  const createImage = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const {outputPath, url, sizes, image} = req.body
      const downloadUrl = url
        || (typeof image === 'string' && /^https?:\/\//i.test(image.trim()) ? image.trim() : null)
      let buf: Buffer

      if (downloadUrl) {
        buf = await downloadRemoteImage(downloadUrl)
      } else {
        buf = Buffer.from(req.body.image, 'base64')
      }

      const result = await getImageMedia().processAndSaveImage({
        buffer: buf,
        outputPath,
        sizes,
      })
      res.status(201).send({outputPath: result})
    } catch (e) {
      console.log(e)
      res.status(202).send(e)
    }
  }

  const createMarkThumbForMark = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const markId = Number(req.body.markId)
      const mediaId = Number(req.body.mediaId)

      if (!markId || !mediaId) {
        res.status(400).send({message: 'markId and mediaId are required'})
        return
      }

      const mark = marksRepo.findByIdAndMediaId(markId, mediaId)

      if (!mark) {
        res.status(404).send({message: 'Mark not found'})
        return
      }

      const media = mediaRepo.findById(mediaId)

      if (!media?.path) {
        res.status(404).send({message: 'Media not found'})
        return
      }

      const resolvedInputPath = resolveActiveDbFilePath(media.path, dbPath)
      if (!resolvedInputPath) {
        res.status(400).send({message: 'The video does not exist.'})
        return
      }

      const marksDir = path.join(dbPath ?? '', 'media/videos/marks')
      if (!fs.existsSync(marksDir)) {
        fs.mkdirSync(marksDir, {recursive: true})
      }

      const outputPath = path.join(marksDir, `${markId}.jpg`)
      if (!req.body.overwrite && fs.existsSync(outputPath)) {
        res.status(400).send({message: 'The image already exists.'})
        return
      }

      await createThumbCustom(
        formatMarkTimestamp(Number(mark.time)),
        resolvedInputPath,
        outputPath,
        VIDEO_MARK_HEIGHT,
        VIDEO_MARK_JPEG_QUALITY,
      )
      res.status(201).send('success')
    } catch (e) {
      res.status(400).send(e)
    }
  }

  return {
    createThumbForVideo,
    createThumb,
    createMarkThumbForMark,
    createGrid,
    createTimeline,
    createImage,
  }
}
