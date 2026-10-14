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
})
