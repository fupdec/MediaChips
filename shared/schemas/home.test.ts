import { describe, expect, it } from 'vitest'
import {
  parseExtendedStats,
  parseChartStats,
  parseCreatedCalendarMonth,
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

  it('parses chart stats', () => {
    const result = parseChartStats({
      days: ['2026-08-01', '2026-08-02'],
      period: 30,
      granularity: 'day',
      mediaTotal: 3,
      tagsTotal: 2,
      media: {added: [1, 0], viewed: [0, 2], edited: [0, 1]},
      tags: {added: [0, 1], viewed: [1, 0], edited: [0, 0]},
    })
    expect(result.mediaTotal).toBe(3)
    expect(result.period).toBe(30)
    expect(result.media.added).toEqual([1, 0])
    expect(result.tags.viewed[0]).toBe(1)
  })

  it('parses created calendar month', () => {
    const result = parseCreatedCalendarMonth({
      year: 2026,
      month: 8,
      days: [{day: '2026-08-12', count: 4}],
      totalInMonth: 4,
      totalWithDate: 20,
      totalMissingDate: 1,
    })
    expect(result.month).toBe(8)
    expect(result.days[0]).toEqual({day: '2026-08-12', count: 4})
  })

  it('parses health and markers', () => {
    const health = parseHomeHealth({
      score: 82,
      queue: [
        {
          id: 'visuals',
          severity: 'info',
          count: 3,
          autoFixable: true,
          settingsSection: 'generate_video_images',
        },
        {
          id: 'missing',
          severity: 'info',
          count: 0,
          autoFixable: false,
          settingsSection: 'find_missing',
        },
      ],
      duplicates: { byFilesize: 1, byContentHash: 2 },
      contentHash: { total: 10, pending: 3, hashed: 7 },
      oshash: { total: 5, pending: 2, hashed: 3 },
      videoCodec: { total: 8, pending: 2, filled: 6 },
      clip: { total: 4, pending: 1, hashed: 3, modelStatus: 'downloaded' },
      faces: { total: 9, pending: 2, generated: 7 },
    })
    expect(health.duplicates?.byContentHash).toBe(2)
    expect(health.oshash?.pending).toBe(2)
    expect(health.videoCodec?.pending).toBe(2)
    expect(health.score).toBe(82)
    expect(health.queue?.[0]?.id).toBe('visuals')
    expect(health.clip?.pending).toBe(1)
    expect(health.faces?.pending).toBe(2)

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
