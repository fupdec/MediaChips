import {describe, expect, it} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'
import {useReviewModeStore} from '@/stores/reviewMode'

describe('useReviewModeStore', () => {
  it('opens on a start id and navigates', () => {
    setActivePinia(createPinia())
    const store = useReviewModeStore()
    const ok = store.open([
      {id: 1, name: 'a'},
      {id: 2, name: 'b'},
      {id: 3, name: 'c'},
    ], 2)
    expect(ok).toBe(true)
    expect(store.active).toBe(true)
    expect(store.currentId).toBe(2)
    expect(store.counter).toBe('2 / 3')
    expect(store.goNext()).toBe(true)
    expect(store.currentId).toBe(3)
    expect(store.goNext()).toBe(false)
    expect(store.goPrev()).toBe(true)
    expect(store.currentId).toBe(2)
  })

  it('rejects empty lists', () => {
    setActivePinia(createPinia())
    const store = useReviewModeStore()
    expect(store.open([])).toBe(false)
    expect(store.active).toBe(false)
  })
})
