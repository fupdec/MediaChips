import {describe, expect, it} from 'vitest'
import {pickLargestDetection} from './faceEnrollTag'

describe('pickLargestDetection', () => {
  it('picks the face with the largest box area', () => {
    const small = {score: 0.9, box: {x: 0, y: 0, width: 10, height: 10}}
    const large = {score: 0.5, box: {x: 0, y: 0, width: 40, height: 40}}
    expect(pickLargestDetection([small, large])).toBe(large)
    expect(pickLargestDetection([large, small])).toBe(large)
  })

  it('keeps the first face on equal area', () => {
    const a = {box: {x: 0, y: 0, width: 10, height: 10}}
    const b = {box: {x: 1, y: 1, width: 10, height: 10}}
    expect(pickLargestDetection([a, b])).toBe(a)
  })
})
