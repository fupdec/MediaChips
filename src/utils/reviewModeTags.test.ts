import {describe, expect, it} from 'vitest'
import {buildReviewTagSlots, findReviewTagSlot} from './reviewModeTags'

describe('buildReviewTagSlots', () => {
  it('uses favorite tags sorted by views then name', () => {
    const slots = buildReviewTagSlots([
      {id: 1, metaId: 2, name: 'Beta', favorite: 1, views: 1},
      {id: 2, metaId: 2, name: 'Alpha', favorite: true, views: 9},
      {id: 3, metaId: 2, name: 'Skip', favorite: 0, views: 99},
      {id: 4, metaId: 2, name: 'Gamma', favorite: '1', views: 9},
    ])
    expect(slots.map((s) => s.name)).toEqual(['Alpha', 'Gamma', 'Beta'])
    expect(slots[0]).toMatchObject({key: 'KeyQ', label: 'Q', tagId: 2})
    expect(slots[1].label).toBe('W')
  })

  it('caps at nine slots', () => {
    const tags = Array.from({length: 12}, (_, i) => ({
      id: i + 1,
      metaId: 1,
      name: `T${i}`,
      favorite: 1,
      views: i,
    }))
    expect(buildReviewTagSlots(tags)).toHaveLength(9)
  })
})

describe('findReviewTagSlot', () => {
  it('finds by key code', () => {
    const slots = buildReviewTagSlots([
      {id: 10, metaId: 1, name: 'A', favorite: 1},
    ])
    expect(findReviewTagSlot(slots, 'KeyQ')?.tagId).toBe(10)
    expect(findReviewTagSlot(slots, 'KeyZ')).toBeNull()
  })
})
