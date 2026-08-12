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
    expect(JSON.parse(sessionStorage.getItem('mediachips.sessionFocus') || '{}')).toMatchObject({
      tagId: 9,
      metaId: 3,
      name: 'Alice',
    })

    store.clearFocus()
    expect(store.isActive).toBe(false)
    expect(sessionStorage.getItem('mediachips.sessionFocus')).toBeNull()
  })

  it('ignores incomplete focus payloads', () => {
    const store = useSessionFocusStore()
    store.setFocus({tagId: 0, metaId: 1, name: 'x'})
    expect(store.isActive).toBe(false)
    store.setFocus({tagId: 1, metaId: 1, name: '  '})
    expect(store.isActive).toBe(false)
  })
})
