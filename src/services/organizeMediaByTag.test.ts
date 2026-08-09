import {describe, expect, it} from 'vitest'
import {buildOrganizeMoveItems, hasOrganizeByTagPrefs} from './organizeMediaByTag'

describe('organizeMediaByTag', () => {
  it('builds nested folders from meta tag structure', () => {
    const mediaById = new Map([
      [1, {
        id: 1,
        path: '/lib/a.mp4',
        tags: [
          {metaId: 10, tagId: 100},
          {metaId: 20, tagId: 200},
        ],
      }],
    ])
    const tagsById = new Map([
      [100, {id: 100, name: 'Studio'}],
      [200, {id: 200, name: 'Alice'}],
    ])

    const items = buildOrganizeMoveItems({
      ids: [1],
      root: '/Videos',
      metaIds: [10, 20],
      mediaById,
      tagsById,
    })

    expect(items).toEqual([{id: 1, folder: '/Videos/Studio/Alice'}])
  })

  it('skips missing meta levels and reports prefs validity', () => {
    const mediaById = new Map([
      [1, {id: 1, tags: [{metaId: 20, tagId: 200}]}],
    ])
    const tagsById = new Map([[200, {id: 200, name: 'Alice'}]])
    const items = buildOrganizeMoveItems({
      ids: [1],
      root: '/Videos',
      metaIds: [10, 20],
      mediaById,
      tagsById,
    })
    expect(items).toEqual([{id: 1, folder: '/Videos/Alice'}])
    expect(hasOrganizeByTagPrefs({root: '/Videos', metaIds: [10]})).toBe(true)
    expect(hasOrganizeByTagPrefs({root: '', metaIds: [10]})).toBe(false)
  })
})
