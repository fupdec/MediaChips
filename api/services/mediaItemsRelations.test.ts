import {describe, expect, it} from 'vitest'
import {
  GROUP_SLIM_SELECT,
  buildGroupSlimSelect,
  groupSlimNeedsMetadataJoin,
} from './mediaItemsRelations'

describe('buildGroupSlimSelect', () => {
  it('keeps the full slim select for pinnedMeta', () => {
    expect(buildGroupSlimSelect('pinnedMeta', 'name')).toBe(GROUP_SLIM_SELECT)
    expect(groupSlimNeedsMetadataJoin('pinnedMeta')).toBe(true)
  })

  it('prunes path grouping to id + path (+ sort columns)', () => {
    const sql = buildGroupSlimSelect('path', 'name')
    expect(sql).toContain('media.id')
    expect(sql).toContain('media.path')
    expect(sql).toContain('media.name')
    expect(sql).not.toContain('videoMetadata.bitrate')
    expect(sql).not.toContain('videoMetadata.duration')
    expect(groupSlimNeedsMetadataJoin('path', 'name')).toBe(false)
  })

  it('includes rating only for rating groups', () => {
    const sql = buildGroupSlimSelect('rating', 'rating')
    expect(sql).toContain('media.rating')
    expect(sql).not.toContain('media.path')
    expect(sql).not.toContain('videoMetadata')
    expect(groupSlimNeedsMetadataJoin('rating')).toBe(false)
  })

  it('joins metadata for duration and resolution groups', () => {
    expect(buildGroupSlimSelect('duration', 'duration')).toContain('videoMetadata.duration')
    expect(groupSlimNeedsMetadataJoin('duration')).toBe(true)

    const resolution = buildGroupSlimSelect('resolution', 'height')
    expect(resolution).toContain('AS width')
    expect(resolution).toContain('AS height')
    expect(groupSlimNeedsMetadataJoin('resolution')).toBe(true)
  })

  it('picks the date field from sortBy for date groups', () => {
    expect(buildGroupSlimSelect('dateMonth', 'viewedAt')).toContain('media.viewedAt')
    expect(buildGroupSlimSelect('dateYear', 'updatedAt')).toContain('media.updatedAt')
    expect(buildGroupSlimSelect('dateDay', 'name')).toContain('media.createdAt')
  })
})
