import {beforeEach, describe, expect, it, vi} from 'vitest'
import type {PageItem} from '@/utils/pageItem'

const getContextMenu = vi.fn(() => [{name: 'Edit', type: 'item'}])
const useItemContextMenu = vi.fn(() => ({getContextMenu}))
const showContextMenu = vi.fn()

vi.mock('@/composable/ItemContextMenu', () => ({
  default: (...args: unknown[]) => useItemContextMenu(...args),
}))

vi.mock('@/stores/contextMenu', () => ({
  useContextMenu: () => ({showContextMenu}),
}))

describe('openItemContextMenu', () => {
  beforeEach(() => {
    getContextMenu.mockClear()
    useItemContextMenu.mockClear()
    showContextMenu.mockClear()
  })

  it('opens a single-item media menu at the cursor', async () => {
    const {openItemContextMenu} = await import('./openItemContextMenu')
    const item = {id: 42, name: 'Clip', path: '/a.mp4'} as PageItem
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 120,
      clientY: 80,
    } as unknown as MouseEvent

    openItemContextMenu(event, item, 'media', null, false)

    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.stopPropagation).toHaveBeenCalled()
    expect(useItemContextMenu).toHaveBeenCalledWith(
      item,
      'media',
      null,
      false,
      null,
      {singleItem: true},
    )
    expect(showContextMenu).toHaveBeenCalledWith({
      content: [{name: 'Edit', type: 'item'}],
      x: 120,
      y: 80,
      tagMeta: null,
      targetItemId: 42,
    })
  })

  it('passes tag meta through to the menu payload', async () => {
    const {openItemContextMenu} = await import('./openItemContextMenu')
    const item = {id: 7, name: 'Actor', metaId: 3} as PageItem
    const meta = {id: 3, name: 'People', type: 'array'} as never
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 10,
      clientY: 20,
    } as unknown as MouseEvent

    openItemContextMenu(event, item, 'tag', meta)

    expect(useItemContextMenu).toHaveBeenCalledWith(
      item,
      'tag',
      meta,
      true,
      null,
      {singleItem: true},
    )
    expect(showContextMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        tagMeta: meta,
        targetItemId: 7,
      }),
    )
  })
})
