import { describe, expect, it } from 'vitest'
import {
  parseAssignedMetaList,
  parseFilterRowResponse,
  parseMark,
  parseMarksForVideo,
  parseMeta,
  parseMetaInMediaTypeAssignments,
  parseMetaSetting,
  parsePathTagEntries,
  parsePlaylistMediaLinks,
  parseTagFilterResponse,
  parseVideoMetadata,
} from '@shared/schemas'

describe('media-meta schemas', () => {
  it('parses meta and assigned meta list', () => {
    const meta = parseMeta({ id: 1, name: 'Country', type: 'array' })
    expect(meta.name).toBe('Country')

    const assigned = parseAssignedMetaList([
      { id: 2, order: 1, meta: { id: 1, name: 'Country' } },
    ])
    expect(assigned[0]?.meta?.name).toBe('Country')
  })

  it('parses playlist media links', () => {
    const links = parsePlaylistMediaLinks([
      { mediaId: 10, playlistId: 3, order: 1, medium: { id: 10, name: 'clip.mp4' } },
    ])
    expect(links[0]?.mediaId).toBe(10)
  })

  it('parses filter row, marks and metadata', () => {
    const row = parseFilterRowResponse({
      id: 5,
      param: 'rating',
      type: 'number',
      cond: 'greater',
      val: 3,
      note: null,
      active: true,
      lock: false,
    })
    expect(row.id).toBe(5)

    const marks = parseMarksForVideo([{ id: 1, type: 'meta', time: 42, mediaId: 7 }])
    expect(marks[0]?.time).toBe(42)

    const mark = parseMark({ id: 2, type: 'bookmark', time: 10, mediaId: 3 })
    expect(mark.type).toBe('bookmark')

    const metadata = parseVideoMetadata({ mediaId: 7, width: 1920 })
    expect(metadata.mediaId).toBe(7)
  })

  it('parses tag filter response', () => {
    const response = parseTagFilterResponse({
      items: [{ id: 4, name: 'Tag' }],
    })
    expect(response.items[0]?.name).toBe('Tag')
  })

  it('parses path tag entries', () => {
    const entries = parsePathTagEntries([
      { mediaId: 5, tagId: 2, metaId: 1 },
    ])
    expect(entries[0]?.tagId).toBe(2)
  })

  it('parses meta setting', () => {
    const setting = parseMetaSetting({ isLink: true, ratingMax: 10, sortBy: 'name' })
    expect(setting.isLink).toBe(true)
    expect(setting.ratingMax).toBe(10)
  })

  it('parses assignment row variants', () => {
    const rows = parseMetaInMediaTypeAssignments([
      { mediaTypeId: 1, metaId: 2, order: 0, meta: { id: 2, name: 'Actor' } },
    ])
    expect(rows[0]?.mediaTypeId).toBe(1)
  })
})
