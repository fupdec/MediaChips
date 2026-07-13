import { describe, expect, it } from 'vitest'
import { flattenFingerprintMatches } from './theporndbApi'

describe('theporndbApi helpers', () => {
  it('flattens nested fingerprint matches and deduplicates scenes', () => {
    const scenes = flattenFingerprintMatches([
      [
        {id: '1', title: 'Scene A'},
        {id: '2', title: 'Scene B'},
      ],
      [
        {id: '2', title: 'Scene B duplicate'},
        {id: '3', title: 'Scene C'},
      ],
    ])

    expect(scenes.map((scene) => scene.id)).toEqual(['1', '2', '3'])
  })
})
