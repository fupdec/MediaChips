import {describe, expect, it} from 'vitest'
import {resolveReviewHotkey} from './reviewModeHotkeys'

function key(code: string, extras: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    code,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...extras,
  } as KeyboardEvent
}

describe('resolveReviewHotkey', () => {
  it('maps navigation and close', () => {
    expect(resolveReviewHotkey(key('Escape'))).toEqual({type: 'close'})
    expect(resolveReviewHotkey(key('ArrowLeft'))).toEqual({type: 'prev'})
    expect(resolveReviewHotkey(key('ArrowRight'))).toEqual({type: 'next'})
    expect(resolveReviewHotkey(key('KeyJ'))).toEqual({type: 'next'})
    expect(resolveReviewHotkey(key('KeyK'))).toEqual({type: 'prev'})
  })

  it('maps digits to rating and 0 to clear', () => {
    expect(resolveReviewHotkey(key('Digit3'))).toEqual({type: 'rating', value: 3})
    expect(resolveReviewHotkey(key('Digit0'))).toEqual({type: 'rating', value: null})
    expect(resolveReviewHotkey(key('Backquote'))).toEqual({type: 'rating', value: null})
  })

  it('maps favorite, play, edit and tag keys', () => {
    expect(resolveReviewHotkey(key('KeyF'))).toEqual({type: 'favorite'})
    expect(resolveReviewHotkey(key('Space'))).toEqual({type: 'play'})
    expect(resolveReviewHotkey(key('KeyP'))).toEqual({type: 'edit'})
    expect(resolveReviewHotkey(key('KeyQ'))).toEqual({type: 'tag', code: 'KeyQ'})
    expect(resolveReviewHotkey(key('KeyO'))).toEqual({type: 'tag', code: 'KeyO'})
  })

  it('maps inbox done only when from inbox', () => {
    expect(resolveReviewHotkey(key('KeyD'))).toBeNull()
    expect(resolveReviewHotkey(key('KeyD'), {fromInbox: true})).toEqual({type: 'inboxDone'})
  })

  it('ignores modified keys', () => {
    expect(resolveReviewHotkey(key('Digit1', {ctrlKey: true}))).toBeNull()
    expect(resolveReviewHotkey(key('ArrowRight', {metaKey: true}))).toBeNull()
  })
})
