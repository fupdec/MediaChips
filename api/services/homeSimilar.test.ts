import {describe, expect, it} from 'vitest'
import {chooseHomeSimilarSeedId} from './homeSimilar'

describe('homeSimilar', () => {
  it('picks a deterministic seed from candidates', () => {
    expect(chooseHomeSimilarSeedId([])).toBeNull()
    expect(chooseHomeSimilarSeedId([10, 20, 30], () => 0)).toBe(10)
    expect(chooseHomeSimilarSeedId([10, 20, 30], () => 0.99)).toBe(30)
  })
})
