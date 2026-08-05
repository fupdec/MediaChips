import { describe, expect, it } from 'vitest'
import { cloneContextMenuPayload } from './contextMenuClone'

describe('cloneContextMenuPayload', () => {
  it('deep-clones nested menu entries without sharing arrays', () => {
    const nested = { name: 'child', action: 'edit' as const }
    const payload = {
      event: { x: 1, y: 2 },
      content: [
        {
          name: 'parent',
          menu: [nested],
        },
      ],
    }

    const cloned = cloneContextMenuPayload(payload as never)
    expect(cloned).toEqual(payload)
    expect(cloned.content).not.toBe(payload.content)
    expect(cloned.content?.[0].menu).not.toBe(payload.content[0].menu)
    expect(cloned.content?.[0].menu?.[0]).not.toBe(nested)

    cloned.content![0].name = 'changed'
    expect(payload.content[0].name).toBe('parent')
  })
})
