import {describe, expect, it} from 'vitest'
import {
  buildVideoImageStatus,
  collectJpgStemIds,
  countGeneratedImages,
} from './videoImagesStatus'

describe('videoImagesStatus', () => {
  it('builds pending counts and tallies generated ids', () => {
    expect(buildVideoImageStatus(10, 3)).toEqual({total: 10, generated: 3, pending: 7})
    expect(countGeneratedImages([{id: 1}, {id: 2}, {id: 3}], new Set(['1', '3']))).toBe(2)
    expect([...collectJpgStemIds(['1.jpg', '2.png', '3.jpg'])].sort()).toEqual(['1', '3'])
  })
})
