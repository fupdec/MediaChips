import {describe, expect, it, vi} from 'vitest'
import {runNasImportQueue} from './nasImportQueue'
import type {NasImportResult} from '@shared/nas'

const success = (path: string, created = true): NasImportResult => ({path, ok: true, id: 1, title: path, created})
describe('NAS import queue', () => {
  it('deduplicates selections, preserves per-file errors and continues into the next batch', async () => {
    const request = vi.fn(async (paths: string[]) => paths.map(path => path === 'bad.mp4'
      ? {path, ok: false as const, code: 'not_found', message: 'Unavailable'} : success(path, path !== 'duplicate.mp4')))
    const results: NasImportResult[] = []
    expect(await runNasImportQueue({paths: ['first.mp4', 'bad.mp4', 'first.mp4', 'duplicate.mp4'], shouldStop: () => false,
      nextChunkSize: async () => 2, request, onResults: batch => { results.push(...batch) }}))
      .toEqual({processed: 3, total: 3, stopped: false})
    expect(request.mock.calls.map(([paths]) => paths)).toEqual([['first.mp4', 'bad.mp4'], ['duplicate.mp4']])
    expect(results[1].ok).toBe(false)
    expect(results[2]).toMatchObject({created: false})
  })
  it('finishes the active batch on Stop and leaves the next files untouched', async () => {
    let stop = false
    const request = vi.fn(async (paths: string[]) => { stop = true; return paths.map(path => success(path)) })
    const onResults = vi.fn()
    expect(await runNasImportQueue({paths: ['1.mp4', '2.mp4', '3.mp4'], shouldStop: () => stop,
      nextChunkSize: async () => 2, request, onResults})).toEqual({processed: 2, total: 3, stopped: true})
    expect(request).toHaveBeenCalledTimes(1)
    expect(onResults).toHaveBeenCalledTimes(1)
  })
  it('respects remaining capacity and a stop during the asynchronous library check', async () => {
    let slots = 1
    const request = vi.fn(async (paths: string[]) => paths.map(path => success(path)))
    const options = {paths: ['1.mp4', '2.mp4'], shouldStop: () => false, nextChunkSize: async () => slots,
      request, onResults: () => { slots = 0 }}
    expect(await runNasImportQueue(options)).toEqual({processed: 1, total: 2, stopped: true})
    let stop = false
    request.mockClear()
    await runNasImportQueue({...options, shouldStop: () => stop, nextChunkSize: async () => { stop = true; return 10 }})
    expect(request).not.toHaveBeenCalled()
  })
  it('keeps incomplete or failed requests retryable without claiming their files were processed', async () => {
    const onResults = vi.fn()
    await expect(runNasImportQueue({paths: ['1.mp4', '2.mp4'], shouldStop: () => false, nextChunkSize: async () => 2,
      request: async () => [success('1.mp4')], onResults})).rejects.toThrow('incomplete')
    expect(onResults).not.toHaveBeenCalled()
  })
  it('continues after a failed or incomplete request, counts attempts, and never replays unknown writes', async () => {
    const request = vi.fn(async (paths: string[]) => {
      if (paths[0] === '1.mp4') throw new Error('timeout')
      if (paths[0] === '3.mp4') return [success('3.mp4')]
      return paths.map(path => success(path))
    })
    const failed: string[] = []
    const completed: string[] = []
    const progress = vi.fn()
    expect(await runNasImportQueue({paths: ['1.mp4', '2.mp4', '3.mp4', '4.mp4', '5.mp4'],
      shouldStop: () => false, nextChunkSize: async () => 2, request,
      onRequestError: paths => { failed.push(...paths) },
      onResults: results => { completed.push(...results.map(result => result.path)) }, onProgress: progress,
    })).toEqual({processed: 5, total: 5, stopped: false})
    expect(failed).toEqual(['1.mp4', '2.mp4', '3.mp4', '4.mp4'])
    expect(completed).toEqual(['5.mp4'])
    expect(request).toHaveBeenCalledTimes(3)
    expect(progress.mock.calls).toEqual([[2, 5], [4, 5], [5, 5]])
  })

  it('records the active failed request on Stop and leaves later files untouched', async () => {
    let stopped = false
    const onRequestError = vi.fn()
    const request = vi.fn(async () => { stopped = true; throw new Error('timeout') })
    expect(await runNasImportQueue({paths: ['1.mp4', '2.mp4', '3.mp4'], shouldStop: () => stopped,
      nextChunkSize: async () => 2, request, onRequestError, onResults: vi.fn(),
    })).toEqual({processed: 2, total: 3, stopped: true})
    expect(onRequestError).toHaveBeenCalledWith(['1.mp4', '2.mp4'], expect.any(Error))
    expect(request).toHaveBeenCalledTimes(1)
  })
})
