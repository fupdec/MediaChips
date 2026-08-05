import {describe, expect, it} from 'vitest'
import {toChipVariant} from './chipVariant'

describe('toChipVariant', () => {
  it.each([
    ['flat', 'flat'],
    ['outlined', 'outlined'],
    ['tonal', 'tonal'],
    ['plain', 'plain'],
    ['text', 'text'],
    ['elevated', 'elevated'],
  ] as const)('accepts %s', (input, expected) => {
    expect(toChipVariant(input)).toBe(expected)
  })

  it.each([null, undefined, '', 'rounded', 1])('rejects %j', (input) => {
    expect(toChipVariant(input)).toBeUndefined()
  })
})
