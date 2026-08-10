import {describe, expect, it} from 'vitest'
import {
  foundByChars,
  matchesTagAutocomplete,
  resolveTagAutocompleteSearchMode,
} from './tagAutocompleteMatch'

describe('tagAutocompleteMatch', () => {
  it('matches substrings anywhere in the name', () => {
    expect(matchesTagAutocomplete({name: 'favorite video'}, 'vorit', 'substring')).toBe(true)
    expect(matchesTagAutocomplete({name: 'favorite video'}, 'zzz', 'substring')).toBe(false)
  })

  it('matches synonyms in substring mode', () => {
    expect(matchesTagAutocomplete(
      {name: 'YasmiButt', synonyms: 'anal, gape'},
      'anal',
      'substring',
    )).toBe(true)
    expect(matchesTagAutocomplete(
      {name: 'Actor', synonyms: 'Performer'},
      'form',
      'substring',
    )).toBe(true)
  })

  it('matches letters with gaps in chars mode', () => {
    expect(foundByChars('favorite video', 'fade')).toBe(true)
    expect(matchesTagAutocomplete({name: 'favorite video'}, 'fade', 'chars')).toBe(true)
    expect(matchesTagAutocomplete(
      {name: 'Display Name', synonyms: 'favorite video'},
      'fade',
      'chars',
    )).toBe(true)
    expect(matchesTagAutocomplete({name: 'favorite video'}, 'xyz', 'chars')).toBe(false)
  })

  it('maps typingFiltersDefault to search modes', () => {
    expect(resolveTagAutocompleteSearchMode('1')).toBe('substring')
    expect(resolveTagAutocompleteSearchMode('0')).toBe('chars')
    expect(resolveTagAutocompleteSearchMode(undefined)).toBe('chars')
  })
})
