/**
 * @vitest-environment node
 */
import {beforeEach, describe, expect, it, vi} from 'vitest'
import type {ApiRequest, ApiResponse} from '../../types/http'

const {createThumbCustom} = vi.hoisted(() => ({
  createThumbCustom: vi.fn(),
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

vi.mock('../../services/remoteImageDownload', () => ({
  downloadRemoteImage: vi.fn(),
}))

vi.mock('../../utils/publicAssets', () => ({
  resolveBundledPublicFile: vi.fn(),
}))

vi.mock('../../services/visualHashBackfill', () => ({
  upsertVisualHashForMedia: vi.fn(),
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
})
