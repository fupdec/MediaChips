import { describe, expect, it } from 'vitest'
import { normalizeTpdbMarkerTime, parseTpdbMarkers } from './theporndbApi'

describe('scene scraper marker parsing', () => {
  it('normalizes numeric and timestamp marker times', () => {
    expect(normalizeTpdbMarkerTime(125.8)).toBe(125)
    expect(normalizeTpdbMarkerTime('01:02:03')).toBe(3723)
    expect(normalizeTpdbMarkerTime('02:30')).toBe(150)
    expect(normalizeTpdbMarkerTime('')).toBeNull()
  })

  it('parses TPDB markers into mark payloads', () => {
    expect(parseTpdbMarkers([
      { title: 'Missionary', start_time: 120 },
      { title: '', start_time: '01:00' },
      { title: 'Ignored', start_time: null },
    ])).toEqual([
      { title: 'Missionary', time: 120, end: null },
      { title: 'Marker', time: 60, end: null },
    ])
  })
})
