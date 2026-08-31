import {describe, expect, it} from 'vitest'
import {
  encodeSessionFocusTagsPayload,
  parseSessionFocusTagsPayload,
  sessionFocusTagFromMediaPayload,
} from './sessionFocusDrag'

describe('sessionFocusDrag', () => {
  it('round-trips tray tag payloads', () => {
    const encoded = encodeSessionFocusTagsPayload([
      {tagId: 1, metaId: 2, name: 'Alice', icon: 'account', color: '#111'},
    ])
    expect(parseSessionFocusTagsPayload(encoded)).toEqual([
      {tagId: 1, metaId: 2, name: 'Alice', icon: 'account', color: '#111'},
    ])
  })

  it('builds a tray tag from a media-chip drag payload', () => {
    expect(sessionFocusTagFromMediaPayload({
      tagId: 8,
      metaId: 3,
      sourceMediaId: 99,
      name: 'Bob',
    })).toEqual({
      tagId: 8,
      metaId: 3,
      name: 'Bob',
      icon: null,
      color: null,
    })
  })
})
