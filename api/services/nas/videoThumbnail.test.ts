/** @vitest-environment node */
import {beforeEach, describe, expect, it, vi} from 'vitest'
const mocks = vi.hoisted(() => {
  const file = {resourceKey: 'movie.mp4', version: 'v1', size: 1000, contentType: 'video/mp4', isDirectory: false}
  const resolved = {provider: 'nas', card: {path: 'nas://source/movie.mp4'}, location: {id: 1, version: 'v1', resourceKey: 'movie.mp4'}, connection: {id: 'source', config: '{}', credentialRef: 'secret'}}
  return {file, resolved, stat: vi.fn(async () => file), close: vi.fn(), inputClose: vi.fn(), healthy: vi.fn(), thumbnail: vi.fn(), rename: vi.fn(), rm: vi.fn()}
})
vi.mock('fs/promises', () => ({default: {mkdir: vi.fn(), stat: vi.fn(async () => ({size: 600})), appendFile: vi.fn(), rename: mocks.rename, rm: mocks.rm}}))
vi.mock('../mediaSources/context', () => ({
  pinSourceDb: (db: unknown) => ({db, assertCurrent: vi.fn()}),
  openSource: vi.fn(async () => ({stat: mocks.stat, close: mocks.close})),
  sourceError: (code: string) => new Error(code),
}))
vi.mock('../mediaSources/locations', () => ({resolveMediaLocation: () => mocks.resolved, nasVersionMatches: (a: string, b: string) => a === b}))
vi.mock('../../db/repositories/videoMetadata', () => ({createVideoMetadataRepository: () => ({findByMediaId: () => ({duration: 100})})}))
vi.mock('./mediaInput', () => ({createNasMediaInput: vi.fn(async () => ({url: 'http://127.0.0.1/input', close: mocks.inputClose, assertHealthy: mocks.healthy}))}))
vi.mock('./mediaProbe', () => ({probeNasMedia: vi.fn(async () => ({metadata: {duration: 100}})), createNasThumbnail: mocks.thumbnail}))
vi.mock('./mediaAssetsState', () => ({nasThumbnailVersion: () => 'jpeg'}))
import {createNasVideoThumbnail} from './videoThumbnail'

describe('manual NAS video poster', () => {
  beforeEach(() => { vi.clearAllMocks() })
  it('uses the requested ratio and atomically replaces the poster after checking the source', async () => {
    await expect(createNasVideoThumbnail({path: '/library'} as never, 7, mocks.resolved.card.path, 0.8)).resolves.toBe('success')
    expect(mocks.thumbnail).toHaveBeenCalledWith('http://127.0.0.1/input', expect.stringContaining('/library/media/videos/thumbs/7.jpg.'), 'video', 100, undefined, expect.any(AbortSignal), 0.8)
    const {probeNasMedia} = await import('./mediaProbe')
    expect(probeNasMedia).not.toHaveBeenCalled()
    expect(mocks.stat).toHaveBeenCalledTimes(2)
    expect(mocks.rename).toHaveBeenCalledWith(expect.any(String), '/library/media/videos/thumbs/7.jpg')
    expect(mocks.inputClose).toHaveBeenCalledOnce()
    expect(mocks.rm).toHaveBeenCalledOnce()
  })
  it('retries a transient NAS connection error', async () => {
    mocks.stat.mockRejectedValueOnce(Object.assign(new Error('temporary network failure'), {code: 'network_error'}))
    await expect(createNasVideoThumbnail({path: '/library'} as never, 7, mocks.resolved.card.path, 0.8)).resolves.toBe('success')
    expect(mocks.stat).toHaveBeenCalledTimes(3)
  })
  it('preserves the existing poster and releases the input when extraction fails', async () => {
    mocks.thumbnail.mockRejectedValueOnce(new Error('ffmpeg failed'))
    await expect(createNasVideoThumbnail({path: '/library'} as never, 7, mocks.resolved.card.path, 0.8)).rejects.toThrow('ffmpeg failed')
    expect(mocks.rename).not.toHaveBeenCalled()
    expect(mocks.inputClose).toHaveBeenCalledOnce()
    expect(mocks.rm).toHaveBeenCalledOnce()
  })
  it('does not publish a frame if the remote video changed during extraction', async () => {
    mocks.stat.mockResolvedValueOnce(mocks.file).mockResolvedValueOnce({...mocks.file, version: 'v2'})
    await expect(createNasVideoThumbnail({path: '/library'} as never, 7, mocks.resolved.card.path, 0.8)).rejects.toThrow('source_changed')
    expect(mocks.rename).not.toHaveBeenCalled()
    expect(mocks.inputClose).toHaveBeenCalledOnce()
  })
})
