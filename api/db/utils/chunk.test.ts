import { describe, expect, it } from 'vitest'
import { BULK_INSERT_CHUNK_SIZE, chunkArray, forEachChunk, mapChunks } from './chunk'

describe('chunk utils', () => {
  it('returns empty for empty input', () => {
    expect(chunkArray([])).toEqual([])
  })

  it('keeps small arrays as a single chunk', () => {
    expect(chunkArray([1, 2, 3], 10)).toEqual([[1, 2, 3]])
  })

  it('splits large arrays by chunk size', () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('uses the default bulk insert size', () => {
    const items = Array.from({ length: BULK_INSERT_CHUNK_SIZE + 1 }, (_, i) => i)
    expect(chunkArray(items)).toHaveLength(2)
  })

  it('forEachChunk visits every item once', () => {
    const seen: number[] = []
    forEachChunk([1, 2, 3, 4], (chunk) => {
      seen.push(...chunk)
    }, 3)
    expect(seen).toEqual([1, 2, 3, 4])
  })

  it('mapChunks concatenates mapped results', () => {
    expect(mapChunks([1, 2, 3, 4], (chunk) => chunk.map((n) => n * 2), 2)).toEqual([2, 4, 6, 8])
  })
})
