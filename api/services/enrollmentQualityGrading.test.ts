import {describe, expect, it} from 'vitest'
import {
  enrollmentMatchesPath,
  gradeFromIssues,
  gradeTag,
  intraSimilarity,
} from './enrollmentQualityGrading'

describe('enrollmentQualityGrading', () => {
  it('grades image issues by severity', () => {
    expect(gradeFromIssues(['missing_file'], null)).toBe('bad')
    expect(gradeFromIssues(['low_score'], 0.5)).toBe('weak')
    expect(gradeFromIssues([], 0.8)).toBe('good')
    expect(gradeFromIssues([], 0.55)).toBe('ok')
  })

  it('grades tags from image grades and issues', () => {
    expect(gradeTag([], [])).toBe('none')
    expect(gradeTag([{grade: 'good'}, {grade: 'good'}], [])).toBe('good')
    expect(gradeTag([{grade: 'good'}, {grade: 'weak'}], [])).toBe('weak')
    expect(gradeTag([{grade: 'bad'}], ['no_face'])).toBe('bad')
  })

  it('matches enrollment paths and averages pairwise similarity', () => {
    expect(enrollmentMatchesPath('meta/1/2_main.jpg', 'meta/1/2_main.jpg', '/abs/meta/1/2_main.jpg')).toBe(true)
    expect(enrollmentMatchesPath(null, 'a', '/a')).toBe(false)

    const a = Float32Array.from([1, 0])
    const b = Float32Array.from([1, 0])
    expect(intraSimilarity([a])).toBe(1)
    expect(intraSimilarity([a, b])).toBe(1)
  })
})
