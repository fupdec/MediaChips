import {describe, expect, it, beforeEach} from 'vitest'
import {
  clearMediaTagDrag,
  encodeMediaTagDragPayload,
  isMediaTagDragActive,
  isMediaTagDragEvent,
  parseMediaTagDragPayload,
  setMediaTagDragActive,
} from './mediaTagDrag'

describe('mediaTagDrag', () => {
  beforeEach(() => {
    clearMediaTagDrag()
  })

  it('round-trips payload JSON', () => {
    const encoded = encodeMediaTagDragPayload({
      tagId: 12,
      metaId: 3,
      sourceMediaId: 99,
      name: 'Action',
    })
    expect(parseMediaTagDragPayload(encoded)).toEqual({
      tagId: 12,
      metaId: 3,
      sourceMediaId: 99,
      name: 'Action',
      icon: undefined,
      color: undefined,
    })
  })

  it('rejects invalid payloads', () => {
    expect(parseMediaTagDragPayload('')).toBeNull()
    expect(parseMediaTagDragPayload('{')).toBeNull()
    expect(parseMediaTagDragPayload(JSON.stringify({tagId: 0, metaId: 1, sourceMediaId: 2}))).toBeNull()
    expect(parseMediaTagDragPayload(JSON.stringify({tagId: 3, metaId: 1}))).toEqual({
      tagId: 3,
      metaId: 1,
      sourceMediaId: 0,
      name: undefined,
      icon: undefined,
      color: undefined,
    })
  })

  it('detects mime type on drag events', () => {
    expect(isMediaTagDragEvent({
      dataTransfer: {
        types: ['application/x-mediachips-media-tag', 'text/plain'],
      } as DataTransfer,
    })).toBe(true)
    expect(isMediaTagDragEvent({
      dataTransfer: {
        types: ['Files'],
      } as DataTransfer,
    })).toBe(false)
  })

  it('tracks active drag state', () => {
    expect(isMediaTagDragActive()).toBe(false)
    setMediaTagDragActive(true)
    expect(isMediaTagDragActive()).toBe(true)
    clearMediaTagDrag()
    expect(isMediaTagDragActive()).toBe(false)
  })
})
