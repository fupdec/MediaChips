import {describe, expect, it} from 'vitest'
import {normalizePastedFilePath, normalizePastedFilePathsText} from './filePathInput'

describe('normalizePastedFilePath', () => {
  it.each([
    [null, null],
    [3, 3],
    ['  /a/b  ', '/a/b'],
    ["'/a/b'", '/a/b'],
    ['"/a/b"', '/a/b'],
    ['\u201C/a/b\u201D', '/a/b'],
    ['x', 'x'],
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizePastedFilePath(input)).toBe(expected)
  })
})

describe('normalizePastedFilePathsText', () => {
  it('normalizes each non-empty line', () => {
    expect(normalizePastedFilePathsText("'/a'\n\n\"/b\"\n")).toBe('/a\n\n/b\n')
  })

  it('passthroughs non-strings', () => {
    expect(normalizePastedFilePathsText(null)).toBeNull()
  })
})
