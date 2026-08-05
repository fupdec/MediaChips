import {describe, expect, it} from 'vitest'
import {
  dedupeByMediaId,
  dedupeLegacyVideosByPath,
  expandMediaIdMappings,
  normalizeLegacyId,
  sameOldId,
} from './lowDbImportDedupe'

describe('lowDbImportDedupe', () => {
  it('normalizes legacy ids', () => {
    expect(normalizeLegacyId('12.0')).toBe('12')
    expect(sameOldId(12, '12.0')).toBe(true)
  })

  it('dedupes videos by path and expands aliases', () => {
    const {videos, oldIdAliases} = dedupeLegacyVideosByPath([
      {oldId: 'a', path: '/x.mp4'},
      {oldId: 'b', path: '/x.mp4'},
      {oldId: 'c', path: '/y.mp4'},
    ])
    expect(videos).toHaveLength(2)
    expect(oldIdAliases.get('b')).toBe('a')

    const expanded = expandMediaIdMappings(
      [{id: 1, oldId: 'a'}, {id: 2, oldId: 'c'}],
      oldIdAliases,
    )
    expect(expanded.some((row) => row.oldId === 'b' && row.id === 1)).toBe(true)
    expect(dedupeByMediaId([{mediaId: 1}, {mediaId: 1}, {mediaId: 2}])).toHaveLength(2)
  })
})
