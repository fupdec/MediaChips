import {beforeEach, describe, expect, it, vi} from 'vitest'
const {post} = vi.hoisted(() => ({post: vi.fn()}))
vi.mock('./ndjsonStream', () => ({postApiNdjsonStream: post}))
import {streamModelDownload} from './streamModelDownload'
import {localAiApi} from './typedApi/localAi'

describe('model download completion', () => {
  beforeEach(() => { post.mockReset() })
  function events(values: unknown[]) {
    post.mockImplementation(async (_path, _options, emit) => { for (const value of values) emit(value) })
  }
  it('rejects streams that end without completion', async () => {
    events([{type: 'status', percent: 20}])
    await expect(streamModelDownload('/model')).rejects.toThrow('did not complete')
    await expect(localAiApi.streamLocalAiDownload(new AbortController().signal, () => {})).rejects.toThrow('did not complete')
  })
  it('rejects Local AI errors instead of reporting success', async () => {
    events([{type: 'error', message: 'fetch failed'}])
    await expect(localAiApi.streamLocalAiDownload(new AbortController().signal, () => {})).rejects.toThrow('fetch failed')
  })
  it('rejects a final status that is not ready', async () => {
    events([{type: 'done', parsed: {status: {status: 'not_downloaded'}}}])
    await expect(streamModelDownload('/model')).rejects.toThrow('did not complete')
  })
  it('accepts a ready model and preserves progress', async () => {
    events([{type: 'status', percent: 50}, {type: 'done', parsed: {status: {status: 'downloaded', model: 'test'}}}])
    const progress = vi.fn()
    await expect(streamModelDownload('/model', {onProgress: progress})).resolves.toEqual({status: {status: 'downloaded', model: 'test'}})
    expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({percent: 100}))
  })
  it('preserves cancellation', async () => {
    events([{type: 'aborted'}])
    await expect(localAiApi.streamLocalAiDownload(new AbortController().signal, () => {})).rejects.toMatchObject({name: 'AbortError'})
  })
})
