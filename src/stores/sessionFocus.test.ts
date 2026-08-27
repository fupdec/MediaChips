import {beforeEach, describe, expect, it} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'
import {useSessionFocusStore} from '@/stores/sessionFocus'

describe('sessionFocus store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    sessionStorage.clear()
  })

  it('stores and clears a focus tag', () => {
    const store = useSessionFocusStore()
    expect(store.isActive).toBe(false)

    store.setFocus({
      tagId: 9,
      metaId: 3,
      name: 'Alice',
      icon: 'account',
    })

    expect(store.isActive).toBe(true)
    expect(store.tagId).toBe(9)
    expect(store.tag?.name).toBe('Alice')
    expect(store.tags).toHaveLength(1)
    expect(JSON.parse(sessionStorage.getItem('mediachips.sessionFocus') || '{}')).toMatchObject({
      tags: [{tagId: 9, metaId: 3, name: 'Alice'}],
    })

    store.clearFocus()
    expect(store.isActive).toBe(false)
    expect(sessionStorage.getItem('mediachips.sessionFocus')).toBeNull()
  })

  it('keeps multiple tags and exposes the first as tag', () => {
    const store = useSessionFocusStore()
    store.addTag({tagId: 1, metaId: 3, name: 'Alice'})
    store.addTag({tagId: 2, metaId: 4, name: 'Bob'})
    expect(store.tags.map((entry) => entry.tagId)).toEqual([1, 2])
    expect(store.tag?.name).toBe('Alice')
    expect(store.hasTag(2)).toBe(true)
    store.removeTag(1)
    expect(store.tag?.name).toBe('Bob')
    expect(store.tagId).toBe(2)
  })

  it('reads a legacy single-tag sessionStorage payload', () => {
    sessionStorage.setItem('mediachips.sessionFocus', JSON.stringify({
      tagId: 5,
      metaId: 2,
      name: 'Legacy',
    }))
    setActivePinia(createPinia())
    const store = useSessionFocusStore()
    expect(store.tags).toEqual([expect.objectContaining({tagId: 5, name: 'Legacy'})])
  })

  it('ignores incomplete focus payloads', () => {
    const store = useSessionFocusStore()
    store.setFocus({tagId: 0, metaId: 1, name: 'x'})
    expect(store.isActive).toBe(false)
    store.setFocus({tagId: 1, metaId: 1, name: '  '})
    expect(store.isActive).toBe(false)
  })

  it('does not duplicate the same tag id', () => {
    const store = useSessionFocusStore()
    store.addTag({tagId: 1, metaId: 3, name: 'Alice'})
    store.addTag({tagId: 1, metaId: 3, name: 'Alice 2'})
    expect(store.tags).toHaveLength(1)
    expect(store.tag?.name).toBe('Alice 2')
  })
})
