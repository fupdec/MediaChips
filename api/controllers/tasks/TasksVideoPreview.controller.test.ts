/**
 * @vitest-environment node
 */
import {beforeEach, describe, expect, it, vi} from 'vitest'
import type {ApiRequest, ApiResponse} from '../../types/http'

const {createThumbCustom} = vi.hoisted(() => ({
  createThumbCustom: vi.fn(),
}))

vi.mock('../../services/nas/videoThumbnail', () => ({
  createNasVideoThumbnail: vi.fn(async () => 'success'),
}))

vi.mock('../../db/repositories/marks', () => ({
  createMarksRepository: () => ({}),
}))

vi.mock('../../db/repositories/media', () => ({
  createMediaRepository: () => ({}),
}))

vi.mock('../../services/contentHash', () => ({
  // Output path must not exist so createThumbCustom is reached.
  resolveExistingPath: vi.fn(async () => null),
}))

vi.mock('../../services/mediaPathResolver', () => ({
  resolveActiveDbFilePath: vi.fn(() => '/tmp/video.mp4'),
}))

vi.mock('../../services/videoPreviewThumb', () => ({
  isUsableVideoThumbFile: vi.fn(() => false),
}))

vi.mock('../../services/remoteImageDownload', () => ({
  downloadRemoteImage: vi.fn(),
}))

vi.mock('../../utils/publicAssets', () => ({
  resolveBundledPublicFile: vi.fn(),
}))

vi.mock('../../services/visualHashBackfill', () => ({
  upsertVisualHashForMedia: vi.fn(),
}))

vi.mock('../../services/mediaClipEmbeddings', () => ({
  upsertClipEmbeddingForMedia: vi.fn(),
}))

vi.mock('../../services/videoGrid', () => ({
  generateVideoGrid: vi.fn(),
}))

vi.mock('../../services/videoGridRequest', () => ({
  resolveMediaIdFromGridRequest: vi.fn(),
}))

import createTasksVideoPreviewController from './TasksVideoPreview.controller'

function createResponse() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code
      return this
    },
    send(payload: unknown) {
      this.body = payload
      return this
    },
  }
  return res as typeof res & ApiResponse
}

describe('TasksVideoPreviewController createGrid output name', () => {
  it.each(['../escape.jpg', '../../etc/x.jpg', 'sub/dir.jpg', '/abs/path.jpg', '..', '.', ''])('rejects output %j', async (output) => {
    const controller = createTasksVideoPreviewController({
      db: {drizzle: {}} as never,
      dbPath: '/tmp/db',
      createThumbMiddle: vi.fn(),
      createThumbCustom,
      getImageMedia: vi.fn(),
    } as never)
    const res = createResponse()
    await controller.createGrid({body: {input: '/tmp', output}} as ApiRequest, res)
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({message: 'Invalid output name'})
  })
})

describe('TasksVideoPreviewController createThumb errors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps thumbnail failures through sendControllerError', async () => {
    createThumbCustom.mockRejectedValueOnce(new Error('ffmpeg failed'))
    const controller = createTasksVideoPreviewController({
      db: {drizzle: {}} as never,
      dbPath: '/tmp/db',
      createThumbMiddle: vi.fn(),
      createThumbCustom,
      getImageMedia: vi.fn(),
    } as never)

    const res = createResponse()
    await controller.createThumb(
      {
        body: {
          inputPath: '/tmp/video.mp4',
          outputPath: '/tmp/out.jpg',
          timestamp: '00:00:01',
          width: 320,
          overwrite: true,
        },
      } as ApiRequest,
      res,
    )

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({message: 'ffmpeg failed'})
  })

  it('routes NAS posters through the authenticated remote thumbnail service', async () => {
    const {createNasVideoThumbnail} = await import('../../services/nas/videoThumbnail')
    const {resolveActiveDbFilePath} = await import('../../services/mediaPathResolver')
    const db = {drizzle: {}} as never
    const createThumbMiddle = vi.fn()
    const controller = createTasksVideoPreviewController({
      db, dbPath: '/tmp/db', createThumbMiddle, createThumbCustom, getImageMedia: vi.fn(),
    } as never)
    const source = 'nas://11111111-1111-4111-8111-111111111111/movie.mp4'
    const res = createResponse()
    await controller.createThumbForVideo({body: {path: source, id: 7, seekRatio: 0.8}} as ApiRequest, res)
    expect(createNasVideoThumbnail).toHaveBeenCalledWith(db, 7, source, 0.8)
    expect(resolveActiveDbFilePath).not.toHaveBeenCalled()
    expect(createThumbMiddle).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe('success')
  })

  it('rejects createThumbForVideo when the source video cannot be resolved', async () => {
    const {resolveActiveDbFilePath} = await import('../../services/mediaPathResolver')
    vi.mocked(resolveActiveDbFilePath).mockReturnValueOnce(null)

    const controller = createTasksVideoPreviewController({
      db: {drizzle: {}} as never,
      dbPath: '/tmp/db',
      createThumbMiddle: vi.fn(),
      createThumbCustom: vi.fn(),
      getImageMedia: vi.fn(),
    } as never)

    const res = createResponse()
    await controller.createThumbForVideo(
      {
        body: {
          path: '/missing/video.mp4',
          id: 1,
        },
      } as ApiRequest,
      res,
    )

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({message: 'The video does not exist.'})
  })
})
