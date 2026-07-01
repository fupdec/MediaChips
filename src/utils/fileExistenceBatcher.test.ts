import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  clearFileExistenceBatchQueue,
  queueFileExistenceCheck,
  resetFileExistenceBatchChecker,
  setFileExistenceBatchChecker,
} from '@/utils/fileExistenceBatcher'

describe('fileExistenceBatcher', () => {
  beforeEach(() => {
    clearFileExistenceBatchQueue()
    resetFileExistenceBatchChecker()
    vi.useFakeTimers()
  })

  afterEach(() => {
    clearFileExistenceBatchQueue()
    resetFileExistenceBatchChecker()
    vi.useRealTimers()
  })

  it('batches multiple path checks into one request', async () => {
    const checker = vi.fn(async (paths: string[]) => (
      Object.fromEntries(paths.map((path) => [path, path.endsWith('.mp4')]))
    ))
    setFileExistenceBatchChecker(checker)

    const first = queueFileExistenceCheck('/a.mp4')
    const second = queueFileExistenceCheck('/b.jpg')
    const third = queueFileExistenceCheck('/a.mp4')

    await vi.advanceTimersByTimeAsync(32)

    await expect(first).resolves.toBe(true)
    await expect(second).resolves.toBe(false)
    await expect(third).resolves.toBe(true)
    expect(checker).toHaveBeenCalledTimes(1)
    expect(checker.mock.calls[0]?.[0]).toEqual(['/a.mp4', '/b.jpg'])
  })

  it('flushes overflow paths in subsequent batches', async () => {
    const checker = vi.fn(async (paths: string[]) => (
      Object.fromEntries(paths.map((path) => [path, true]))
    ))
    setFileExistenceBatchChecker(checker)

    const promises = Array.from({length: 105}, (_, index) => (
      queueFileExistenceCheck(`/file-${index}.jpg`)
    ))

    await vi.advanceTimersByTimeAsync(32)
    await Promise.all(promises)

    expect(checker).toHaveBeenCalledTimes(2)
    expect(checker.mock.calls[0]?.[0]).toHaveLength(100)
    expect(checker.mock.calls[1]?.[0]).toHaveLength(5)
  })
})
