import {describe, expect, it} from 'vitest'
import {
  combineMediaCreatedAt,
  isValidFsTimestampMs,
  parseFfprobeCreationTags,
  pickFirstIsoDate,
  toIsoDateString,
} from './mediaSystemDates'

describe('mediaSystemDates', () => {
  it('parses EXIF-style and ISO date strings', () => {
    expect(toIsoDateString('2020:01:02 03:04:05')).toBe('2020-01-02T03:04:05.000Z')
    expect(toIsoDateString('2020-01-02T03:04:05.000Z')).toBe('2020-01-02T03:04:05.000Z')
    expect(toIsoDateString(new Date('2021-05-06T07:08:09.000Z'))).toBe('2021-05-06T07:08:09.000Z')
    expect(toIsoDateString('')).toBeNull()
    expect(toIsoDateString(0)).toBeNull()
  })

  it('picks the first valid date', () => {
    expect(pickFirstIsoDate(null, '', '2019:12:31 23:59:59')).toBe('2019-12-31T23:59:59.000Z')
  })

  it('reads ffprobe creation tags case-insensitively', () => {
    expect(parseFfprobeCreationTags({
      Creation_Time: '2018-07-04T12:00:00.000000Z',
    })).toBe('2018-07-04T12:00:00.000Z')
    expect(parseFfprobeCreationTags({
      'com.apple.quicktime.creationdate': '2017-03-01T10:11:12Z',
    })).toBe('2017-03-01T10:11:12.000Z')
    expect(parseFfprobeCreationTags({})).toBeNull()
  })

  it('validates filesystem timestamps', () => {
    expect(isValidFsTimestampMs(1_700_000_000_000)).toBe(true)
    expect(isValidFsTimestampMs(0)).toBe(false)
    expect(isValidFsTimestampMs(Number.NaN)).toBe(false)
  })

  it('prefers embedded over filesystem fallback', () => {
    expect(combineMediaCreatedAt(
      '2020-01-01T00:00:00.000Z',
      '2010-01-01T00:00:00.000Z',
    )).toBe('2020-01-01T00:00:00.000Z')
    expect(combineMediaCreatedAt(null, '2010-01-01T00:00:00.000Z'))
      .toBe('2010-01-01T00:00:00.000Z')
    expect(combineMediaCreatedAt(null, null)).toBeNull()
  })
})
