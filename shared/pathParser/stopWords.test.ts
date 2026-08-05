import {describe, expect, it} from 'vitest'
import {PATH_STOP_WORDS} from './stopWords'

describe('PATH_STOP_WORDS', () => {
  it('includes common english fillers', () => {
    expect(PATH_STOP_WORDS.has('the')).toBe(true)
    expect(PATH_STOP_WORDS.has('and')).toBe(true)
    expect(PATH_STOP_WORDS.has('mediachips')).toBe(false)
  })
})
