import { describe, expect, it } from 'vitest'
import {
  parseExtendedStats,
  parseHomeHealth,
  parseHomeMarkers,
  parseHomeMediaStats,
  parseHomeTagCount,
  parseMediaThumbsResponse,
  parseMissingMediaStatus,
  parseSqlQueryMediaRows,
  parseSqlQueryTagRows,
  parseSuggestTagsResponse,
} from '@shared/schemas'

describe('home schemas', () => {
  it('parses media stats and tag count', () => {
    expect(parseHomeMediaStats({ total: 100, filesize: 1024 })).toEqual({
      total: 100,
      filesize: 1024,
    })
    expect(parseHomeTagCount({ count: 42 })).toEqual({ count: 42 })
  })

  it('parses extended stats', () => {
    const result = parseExtendedStats({
      total: 10,
      byType: [{ mediaTypeId: 1, count: 5, name: 'Videos' }],
      averageRating: 3.5,
    })
    expect(result.total).toBe(10)
    expect(result.byType?.[0]?.mediaTypeId).toBe(1)
  })

  it('parses health and markers', () => {
    const health = parseHomeHealth({
      duplicates: { byFilesize: 1, byContentHash: 2 },
      contentHash: { total: 10, pending: 3, hashed: 7 },
      videoCodec: { total: 8, pending: 2, filled: 6 },
    })
    expect(health.duplicates?.byContentHash).toBe(2)
    expect(health.videoCodec?.pending).toBe(2)

    const markers = parseHomeMarkers({ marks: [{ id: 1, time: 12 }] })
    expect(markers.marks?.[0]?.id).toBe(1)
  })

  it('parses thumbs and tag suggestions', () => {
    expect(parseMediaThumbsResponse({ thumbs: { 1: 'path.jpg' } }).thumbs?.[1]).toBe('path.jpg')
    expect(parseSuggestTagsResponse({ suggestions: [{ word: 'tag' }] }).suggestions?.[0]?.word).toBe('tag')
    expect(parseMissingMediaStatus({ missing: 3 }).missing).toBe(3)
  })

  it('parses sql query result rows', () => {
    const mediaRows = parseSqlQueryMediaRows([
      [{ id: 1, name: 'clip.mp4', mediaTypeId: 2 }],
      {},
    ])
    expect(mediaRows[0]?.name).toBe('clip.mp4')

    const tagRows = parseSqlQueryTagRows([
      [{ id: 3, name: 'Actor', metaId: 1 }],
      {},
    ])
    expect(tagRows[0]?.metaId).toBe(1)
  })

  it('rejects invalid home stats', () => {
    expect(() => parseHomeMediaStats({ total: 'bad' })).toThrow()
  })
})
