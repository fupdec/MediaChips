import {describe, expect, it} from 'vitest'
import {mergeSynonymLists} from './tagSynonymMerge'

describe('tagSynonymMerge', () => {
  it('merges names and synonyms case-insensitively and drops survivor name', () => {
    const result = mergeSynonymLists('Alice', 'Ali, AW', [
      {name: 'alice', synonyms: 'AW, Angela'},
      {name: 'Alicia', synonyms: null},
    ])
    expect(result).toBe('Ali, AW, Angela, Alicia')
  })
})
