import {beforeEach, describe, expect, it} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'
import {useContextMenu} from './contextMenu'

describe('context menu store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('sets the shown flag on the given entry only', () => {
    const store = useContextMenu()
    const a = {type: 'menu', show: false}
    const b = {type: 'menu', show: true}
    store.setEntryShown(a, true)
    store.setEntryShown(b, false)
    expect(a.show).toBe(true)
    expect(b.show).toBe(false)
  })
})
