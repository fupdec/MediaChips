/**
 * @vitest-environment node
 */
import {beforeEach, describe, expect, it, vi} from 'vitest'
import type {ApiRequest, ApiResponse} from '../../types/http'

const {collectFilesWithZipGalleries} = vi.hoisted(() => ({
  collectFilesWithZipGalleries: vi.fn(),
}))

vi.mock('../../services/zipGallery', () => ({
  collectFilesWithZipGalleries,
  isVirtualZipPath: () => false,
  zipEntryExists: vi.fn(),
}))

vi.mock('../../services/contentHash', () => ({
  resolveExistingPath: vi.fn(),
}))

vi.mock('../../services/checkFilesExist', () => ({
  checkFilesExist: vi.fn(),
}))

vi.mock('../../services/localAssetCleanup', () => ({
  unlinkResolvedPath: vi.fn(),
}))

vi.mock('../../../app/tasks/moveFile', () => ({
  moveFile: vi.fn(),
  prepareRename: vi.fn(),
  checkRenameDiskSpace: vi.fn(),
}))

vi.mock('../../db/repositories/marks', () => ({
  createMarksRepository: () => ({findAllForVideo: vi.fn(() => [])}),
}))

vi.mock('../../services/markChaptersForPath', () => ({
  marksToChapters: vi.fn(() => []),
  resolveMarkChaptersForPath: vi.fn(() => ({chapters: []})),
}))

vi.mock('../../services/externalPlayerLaunch', () => ({
  ExternalPlayerError: class ExternalPlayerError extends Error {
    code: string
    constructor(message: string, code: string) {
      super(message)
      this.code = code
    }
  },
  launchExternalPlayer: vi.fn(),
}))

import createTasksFileController from './TasksFile.controller'

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
    sendStatus(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.body = payload
      return this
    },
  }
  return res as typeof res & ApiResponse
}

describe('TasksFileController getFileList errors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps not directory failures through sendControllerError', async () => {
    collectFilesWithZipGalleries.mockRejectedValueOnce(new Error('not directory'))
    const controller = createTasksFileController({
      db: {drizzle: {}} as never,
    } as never)

    const res = createResponse()
    await controller.getFileList(
      {
        body: {
          path: '/tmp',
          filter: JSON.stringify('.*'),
          excluded: [],
        },
      } as ApiRequest,
      res,
    )

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({message: 'not directory'})
  })
})
