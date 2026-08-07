import {describe, expect, it} from 'vitest'
import {
  foldMediaPresetFields,
  pickDefaultSurvivorId,
  planMediaValuesToInsert,
  planNearDuplicateMarkIdsToDelete,
  remapMediaTagLinksToSurvivor,
  remapPlaylistLinksToSurvivor,
} from './mediaMergeRemap'

describe('mediaMergeRemap', () => {
  it('remaps tag and playlist links onto survivor and dedupes', () => {
    expect(remapMediaTagLinksToSurvivor([
      {mediaId: 9, tagId: 1, metaId: 2},
      {mediaId: 8, tagId: 1, metaId: 2},
      {mediaId: 8, tagId: 3, metaId: 2},
    ], 5)).toEqual([
      {mediaId: 5, tagId: 1, metaId: 2},
      {mediaId: 5, tagId: 3, metaId: 2},
    ])

    expect(remapPlaylistLinksToSurvivor([
      {mediaId: 9, playlistId: 1, order: 2},
      {mediaId: 8, playlistId: 1, order: 4},
      {mediaId: 8, playlistId: 2, order: 1},
    ], 5)).toEqual([
      {mediaId: 5, playlistId: 1, order: 4},
      {mediaId: 5, playlistId: 2, order: 1},
    ])
  })

  it('plans missing media values only', () => {
    expect(planMediaValuesToInsert(
      [
        {metaId: 1, value: 'a'},
        {metaId: 2, value: 'b'},
        {metaId: 2, value: 'c'},
      ],
      5,
      new Set([1]),
    )).toEqual([{mediaId: 5, metaId: 2, value: 'b'}])
  })

  it('plans near-duplicate mark deletions within a time window', () => {
    expect(planNearDuplicateMarkIdsToDelete([
      {id: 1, type: 'meta', tagId: 9, time: 10, end: 12, text: ''},
      {id: 2, type: 'meta', tagId: 9, time: 10.5, end: 16, text: 'richer'},
      {id: 3, type: 'meta', tagId: 9, time: 20, end: 22, text: ''},
      {id: 4, type: 'favorite', tagId: null, time: 10, end: null, text: ''},
    ])).toEqual([1])
  })

  it('picks default survivor by resolution then filesize then rating then createdAt', () => {
    expect(pickDefaultSurvivorId([
      {id: 1, filesize: 10, rating: 5, createdAt: '2020-01-01', width: 1920, height: 1080},
      {id: 2, filesize: 50, rating: 1, createdAt: '2024-01-01', width: 1280, height: 720},
      {id: 3, filesize: 50, rating: 4, createdAt: '2021-01-01', width: 1920, height: 1080},
    ])).toBe(3)

    expect(pickDefaultSurvivorId([
      {id: 4, filesize: 10, rating: 1, createdAt: '2022-01-01'},
      {id: 5, filesize: 10, rating: 1, createdAt: '2020-01-01'},
    ])).toBe(5)
  })

  it('folds preset fields across survivor and sources (views sum)', () => {
    expect(foldMediaPresetFields(
      {
        favorite: false,
        rating: 2,
        views: 1,
        viewedAt: '2020-01-01',
        bookmark: '',
        createdAt: '2022-01-01',
      },
      [
        {
          favorite: true,
          rating: 5,
          views: 3,
          viewedAt: '2024-01-01',
          bookmark: 'keep',
          createdAt: '2019-01-01',
        },
      ],
    )).toEqual({
      favorite: true,
      rating: 5,
      views: 4,
      viewedAt: '2024-01-01',
      bookmark: 'keep',
      createdAt: '2019-01-01',
    })
  })
})
