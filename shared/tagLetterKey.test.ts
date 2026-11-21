import {describe, expect, it} from 'vitest'
import {compareTagLetterKeys, getTagLetterKey} from './transliterate'

describe('getTagLetterKey', () => {
  it('uppercases the real first letter', () => {
    expect(getTagLetterKey('anna')).toBe('A')
    expect(getTagLetterKey('Анна')).toBe('А')
    expect(getTagLetterKey('  boris')).toBe('B')
  })

  it('merges Latin diacritics but keeps Cyrillic letters', () => {
    expect(getTagLetterKey('élan')).toBe('E')
    expect(getTagLetterKey('Österreich')).toBe('O')
    expect(getTagLetterKey('Ñandú')).toBe('N')
    expect(getTagLetterKey('Ёж')).toBe('Ё')
    expect(getTagLetterKey('Йод')).toBe('Й')
  })

  it('puts digits, symbols and other scripts under #', () => {
    expect(getTagLetterKey('2024')).toBe('#')
    expect(getTagLetterKey('_x')).toBe('#')
    expect(getTagLetterKey('日本')).toBe('#')
    expect(getTagLetterKey('')).toBe('#')
    expect(getTagLetterKey(null)).toBe('#')
  })
})

describe('compareTagLetterKeys', () => {
  it('orders Latin, Greek, Cyrillic, then #', () => {
    const letters = ['#', 'Я', 'B', 'Α', 'A', 'Б']
    expect(letters.sort(compareTagLetterKeys)).toEqual(['A', 'B', 'Α', 'Б', 'Я', '#'])
  })
})
