import { describe, expect, it } from 'vitest'
import { dedupeLegacyVideosByPath } from './lowDbImport'

describe('dedupeLegacyVideosByPath', () => {
  it('keeps the first video for duplicate paths and aliases later oldIds', () => {
    const {videos, oldIdAliases} = dedupeLegacyVideosByPath([
      {oldId: '1', path: '/videos/a.mp4', name: 'first'},
      {oldId: '2', path: '/videos/b.mp4', name: 'unique'},
      {oldId: '3', path: '/videos/a.mp4', name: 'duplicate'},
      {oldId: '4', path: ' /videos/a.mp4 ', name: 'trimmed-duplicate'},
    ])

    expect(videos).toHaveLength(2)
    expect(videos.map((video) => video.oldId)).toEqual(['1', '2'])
    expect(Object.fromEntries(oldIdAliases)).toEqual({
      '3': '1',
      '4': '1',
    })
  })

  it('collapses blank paths onto a single kept row', () => {
    const {videos, oldIdAliases} = dedupeLegacyVideosByPath([
      {oldId: '10', path: '', name: 'missing-a'},
      {oldId: '11', path: '   ', name: 'missing-b'},
      {oldId: '12', path: '/videos/ok.mp4', name: 'ok'},
    ])

    expect(videos).toHaveLength(2)
    expect(videos.some((video) => video.oldId === '10')).toBe(true)
    expect(videos.some((video) => video.oldId === '12')).toBe(true)
    expect(Object.fromEntries(oldIdAliases)).toEqual({
      '11': '10',
    })
  })
})
