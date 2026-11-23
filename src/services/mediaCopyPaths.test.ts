import {beforeEach, afterEach, describe, expect, it, vi} from 'vitest'
const post = vi.hoisted(() => vi.fn())
const context = vi.hoisted(() => ({base: '', token: ''}))
vi.mock('./apiClient', () => ({apiClient: {post}, getApiBaseUrl: () => context.base}))
vi.mock('./authSession', () => ({getAuthToken: () => context.token}))
import {queueMediaCopyPaths} from './mediaCopyPaths'

beforeEach(() => {context.base = ''; context.token = ''})

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


it.each(['base', 'token'] as const)('does not send queued IDs after the %s changes', async field => {
  vi.useFakeTimers()
  post.mockResolvedValue({data: {paths: {1: ['/wrong-library']}}})
  const queued = queueMediaCopyPaths(1)
  context[field] = 'new-context'
  await vi.runAllTimersAsync()
  expect(await queued).toEqual([])
  expect(post).not.toHaveBeenCalled()
})

it('discards copy paths when the server changes during a request', async () => {
  vi.useFakeTimers()
  let finish!: (value: unknown) => void
  post.mockReturnValue(new Promise(resolve => { finish = resolve }))
  const queued = queueMediaCopyPaths(1)
  await vi.advanceTimersByTimeAsync(32)
  context.base = 'new-server'
  finish({data: {paths: {1: ['/old-library']}}})
  expect(await queued).toEqual([])
})
