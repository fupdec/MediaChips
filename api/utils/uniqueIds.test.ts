import {describe, expect, it} from 'vitest'
import {uniqueByKey, uniquePositiveIds} from './uniqueIds'

describe('uniquePositiveIds', () => {
  it('keeps positive finite ids in first-seen order', () => {
    expect(uniquePositiveIds([1, '2', 2, 0, -1, 'x', 3, 1])).toEqual([1, 2, 3])
  })
})

describe('uniqueByKey', () => {
  it('keeps the last item for each key', () => {
    expect(uniqueByKey(
      [{id: 1, k: 'a'}, {id: 2, k: 'b'}, {id: 3, k: 'a'}],
      (item) => item.k,
    )).toEqual([{id: 3, k: 'a'}, {id: 2, k: 'b'}])
  })
})
