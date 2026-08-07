import {describe, expect, it} from 'vitest'
import {isTypingTarget} from './keyboardTarget'

describe('isTypingTarget', () => {
  it('detects native text controls', () => {
    const input = document.createElement('input')
    const textarea = document.createElement('textarea')
    const select = document.createElement('select')
    expect(isTypingTarget(input)).toBe(true)
    expect(isTypingTarget(textarea)).toBe(true)
    expect(isTypingTarget(select)).toBe(true)
  })

  it('detects editable ancestors via closest', () => {
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    const child = document.createElement('span')
    editable.appendChild(child)
    expect(isTypingTarget(child)).toBe(true)
  })

  it('ignores ordinary elements', () => {
    expect(isTypingTarget(document.createElement('div'))).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})
