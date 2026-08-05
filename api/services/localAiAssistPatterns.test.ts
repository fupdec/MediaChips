import {describe, expect, it} from 'vitest'
import {
  asStringArray,
  extractPrimaryCaptureGroup,
  looksLikeEchoedSample,
  looksLikePathShapedPattern,
  shrinkPathShapedPattern,
  stripRegexDelimiters,
} from './localAiAssistPatterns'

describe('localAiAssistPatterns', () => {
  it('strips flagged delimiters and keeps bare paths', () => {
    expect(stripRegexDelimiters('/\\d+/i')).toBe('\\d+')
    expect(stripRegexDelimiters('/Shows/')).toBe('/Shows/')
  })

  it('detects echoed samples and path-shaped templates', () => {
    expect(looksLikeEchoedSample('/Media/a.mp4', '/Media/a.mp4')).toBe(true)
    expect(looksLikePathShapedPattern('/Media/Library/[Studio]title_(\\d{4})\\.mp4')).toBe(true)
    expect(looksLikePathShapedPattern('(\\d{4})')).toBe(false)
  })

  it('extracts capture groups and shrinks path templates', () => {
    expect(extractPrimaryCaptureGroup('foo(\\d{4})bar')).toBe('(\\d{4})')
    expect(shrinkPathShapedPattern('/Media/x_(\\d{4})\\.mp4')).toBe('(\\d{4})')
    expect(asStringArray([' a ', '', 'b'], 1)).toEqual(['a'])
  })
})
