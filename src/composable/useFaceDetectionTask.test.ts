import {beforeEach, describe, expect, it, vi} from 'vitest'

const {
  getFacesForMedia,
  getFaceModelStatus,
  getFaceEmbedModelStatus,
  downloadFaceModel,
  downloadFaceEmbedModel,
  streamFaceDetection,
  setNotification,
  setTask,
  updateTask,
  removeTask,
  openFaceResults,
} = vi.hoisted(() => ({
  getFacesForMedia: vi.fn(),
  getFaceModelStatus: vi.fn(async () => ({data: {status: 'loaded'}})),
  getFaceEmbedModelStatus: vi.fn(async () => ({data: {status: 'loaded'}})),
  downloadFaceModel: vi.fn(async () => ({})),
  downloadFaceEmbedModel: vi.fn(async () => ({})),
  streamFaceDetection: vi.fn(async (_body, _opts, onEvent) => {
    onEvent({type: 'progress', processed: 1, total: 1, faces: 2})
    onEvent({type: 'complete', faces: 2})
  }),
  setNotification: vi.fn(),
  setTask: vi.fn(() => 'task-1'),
  updateTask: vi.fn(),
  removeTask: vi.fn(),
  openFaceResults: vi.fn(),
}))

vi.mock('@/services/typedApi', () => ({
  typedApi: {
    getFacesForMedia,
    getFaceModelStatus,
    getFaceEmbedModelStatus,
    downloadFaceModel,
    downloadFaceEmbedModel,
    streamFaceDetection,
  },
}))

vi.mock('@/services/notificationService', () => ({
  setNotification,
}))

vi.mock('@/services/modelDownloadConsent', async () => {
  const actual = await vi.importActual<typeof import('@/services/modelDownloadConsent')>(
    '@/services/modelDownloadConsent',
  )
  return {
    ...actual,
    ensureModelsDownloaded: vi.fn(async ({models}) => {
      for (const model of models || []) await model.download()
      return 'ok'
    }),
  }
})

vi.mock('@/stores/dialogs', () => ({
  useDialogsStore: () => ({openFaceResults}),
}))

vi.mock('@/stores/tasks', () => ({
  useTasksStore: () => ({setTask, updateTask, removeTask}),
}))

vi.mock('@/utils/translate', () => ({
  default: (key: string, params: Record<string, unknown> = {}) => (
    `${key}:${JSON.stringify(params)}`
  ),
}))

import {runFaceDetectionForMediaIds} from './useFaceDetectionTask'

describe('runFaceDetectionForMediaIds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getFaceModelStatus.mockResolvedValue({data: {status: 'loaded'}})
    streamFaceDetection.mockImplementation(async (_body, _opts, onEvent) => {
      onEvent({type: 'progress', processed: 1, total: 1, faces: 2})
      onEvent({type: 'complete', faces: 2})
    })
  })

  it('opens existing faces for a single item without rescanning', async () => {
    getFacesForMedia.mockResolvedValueOnce({data: {faces: [{id: 1}]}})
    const reloadMediaItems = vi.fn()

    await runFaceDetectionForMediaIds({
      mediaIds: [42],
      locale: 'en',
      contextItem: {id: 42},
      reloadMediaItems,
    })

    expect(openFaceResults).toHaveBeenCalledWith({id: 42})
    expect(streamFaceDetection).not.toHaveBeenCalled()
    expect(reloadMediaItems).not.toHaveBeenCalled()
  })

  it('streams detection for multi-item selection and reloads media', async () => {
    const reloadMediaItems = vi.fn()
    streamFaceDetection.mockImplementation(async (_body, _opts, onEvent) => {
      onEvent({type: 'progress', processed: 2, total: 2, faces: 3})
      onEvent({type: 'complete', faces: 3})
    })

    await runFaceDetectionForMediaIds({
      mediaIds: [1, 2],
      locale: 'en',
      reloadMediaItems,
    })

    expect(streamFaceDetection).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaIds: [1, 2],
        force: true,
        applyTags: true,
      }),
      expect.objectContaining({signal: expect.any(AbortSignal)}),
      expect.any(Function),
    )
    expect(openFaceResults).not.toHaveBeenCalled()
    expect(removeTask).toHaveBeenCalledWith('task-1')
    expect(reloadMediaItems).toHaveBeenCalledWith([1, 2])
  })

  it('downloads the model when not ready', async () => {
    getFacesForMedia.mockResolvedValueOnce({data: {faces: []}})
    getFaceModelStatus.mockResolvedValueOnce({data: {status: 'missing'}})

    await runFaceDetectionForMediaIds({
      mediaIds: [9],
      locale: 'en',
      contextItem: {id: 9},
      reloadMediaItems: vi.fn(),
    })

    expect(downloadFaceModel).toHaveBeenCalled()
  })

  it('removes the task on abort without error notification', async () => {
    getFacesForMedia.mockResolvedValueOnce({data: {faces: []}})
    streamFaceDetection.mockRejectedValueOnce(Object.assign(new Error('aborted'), {name: 'AbortError'}))

    await runFaceDetectionForMediaIds({
      mediaIds: [9],
      locale: 'en',
      contextItem: {id: 9},
      reloadMediaItems: vi.fn(),
    })

    expect(removeTask).toHaveBeenCalledWith('task-1')
    expect(setNotification).not.toHaveBeenCalledWith(expect.objectContaining({type: 'error'}))
  })
})
