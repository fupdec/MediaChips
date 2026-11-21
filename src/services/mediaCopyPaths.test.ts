import {afterEach, describe, expect, it, vi} from 'vitest'
const post = vi.hoisted(() => vi.fn())
vi.mock('./apiClient', () => ({apiClient: {post}, getApiBaseUrl: () => ''}))
vi.mock('./authSession', () => ({getAuthToken: () => ''}))
import {queueMediaCopyPaths} from './mediaCopyPaths'

afterEach(() => {vi.useRealTimers(); post.mockReset()})
describe('copy path batching', () => {
  it('combines cards and deduplicates IDs without retaining stale results', async () => {
    vi.useFakeTimers()
    post.mockResolvedValue({data: {paths: {1: ['/a'], 2: ['/b']}}})
    const results = [queueMediaCopyPaths(1), queueMediaCopyPaths(2), queueMediaCopyPaths(1)]
    await vi.runAllTimersAsync()
    expect(await Promise.all(results)).toEqual([['/a'], ['/b'], ['/a']])
    expect(post).toHaveBeenCalledExactlyOnceWith('/api/Media/copy-paths', {ids: [1, 2]})
    const next = queueMediaCopyPaths(1)
    await vi.runAllTimersAsync()
    await next
    expect(post).toHaveBeenCalledTimes(2)
  })
  it('limits requests to 100 IDs', async () => {
    vi.useFakeTimers()
    post.mockResolvedValue({data: {paths: {}}})
    const results = Array.from({length: 201}, (_, id) => queueMediaCopyPaths(id + 1))
    await vi.runAllTimersAsync()
    expect(await Promise.all(results)).toHaveLength(201)
    expect(post.mock.calls.map(call => call[1].ids.length)).toEqual([100, 100, 1])
  })
})
