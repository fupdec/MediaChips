import {describe, expect, it} from 'vitest'
import {allocateCopyName} from './copyName'

describe('allocateCopyName', () => {
  it('appends (copy) when free', () => {
    expect(allocateCopyName('Actors', () => false)).toBe('Actors (copy)')
  })

  it('increments when (copy) is taken', () => {
    const taken = new Set(['Actors (copy)', 'Actors (copy 2)'])
    expect(allocateCopyName('Actors', (name) => taken.has(name))).toBe('Actors (copy 3)')
  })

  it('uses fallback for empty base name', () => {
    expect(allocateCopyName('  ', () => false, 'Tags')).toBe('Tags (copy)')
  })
})
