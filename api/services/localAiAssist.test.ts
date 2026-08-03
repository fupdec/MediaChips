import {describe, expect, it} from 'vitest'
import {
  asStringArray,
  buildFilterAssistPrompt,
  buildRegexAssistPrompt,
  normalizeAssistParsed,
  normalizeFilterAssistParsed,
  normalizeRegexAssistParsed,
  stripRegexDelimiters,
} from './localAiAssist'

describe('localAiAssist', () => {
  it('strips /pattern/flags delimiters', () => {
    expect(stripRegexDelimiters('/\\[([^\\]]+)\\]/i')).toBe('\\[([^\\]]+)\\]')
    expect(stripRegexDelimiters('\\[([^\\]]+)\\]')).toBe('\\[([^\\]]+)\\]')
    expect(stripRegexDelimiters('/Shows/')).toBe('/Shows/')
  })

  it('normalizes filter suggestions and fills missing summary', () => {
    const parsed = normalizeFilterAssistParsed({
      suggestions: ['Add Favorite = yes', '  ', 'Add Rating ≥ 4', 12],
      explanation: 'Focus on liked high-rated media.',
    })
    expect(parsed).toEqual({
      summary: 'Filter ideas: Add Favorite = yes',
      suggestions: ['Add Favorite = yes', 'Add Rating ≥ 4', '12'],
      explanation: 'Focus on liked high-rated media.',
    })
  })

  it('returns null for empty filter payloads', () => {
    expect(normalizeFilterAssistParsed(null)).toBeNull()
    expect(normalizeFilterAssistParsed({summary: '  '})).toBeNull()
  })

  it('repairs bad regex with deterministic path generator when there is no goal', () => {
    const sample = '/Media/Library/[StudioName]clip.mp4'
    const repaired = normalizeRegexAssistParsed(
      {pattern: '/Users/me/Media/file.mp4', replace: '$1', explanation: 'oops'},
      {sample, captureText: 'StudioName', mode: 'extract'},
    )
    expect(repaired?.pattern).toBe('\\[([^\\]]+)\\]')
    expect(repaired?.replace).toBe('$1')
    expect(String(repaired?.explanation)).toContain('adjusted')
  })

  it('does not override a goal-driven year pattern with sample brackets fallback', () => {
    const sample = '/Media/Library/[StudioName]title_episode_03.mp4'
    const kept = normalizeRegexAssistParsed(
      {
        pattern: '(19|20)\\d{2}',
        replace: '$1',
        explanation: 'Find a year.',
      },
      {
        goal: 'найди год',
        sample,
        captureText: 'StudioName',
        mode: 'extract',
      },
    )
    expect(kept?.pattern).toBe('(19|20)\\d{2}')
    expect(kept?.explanation).toBe('Find a year.')
  })

  it('rejects echoed sample paths when a goal is set', () => {
    const sample = '/Media/Library/[StudioName]title_episode_03.mp4'
    const rejected = normalizeRegexAssistParsed(
      {
        pattern: '/Media/Library/\\[StudioName\\]title_episode_03\\.mp4',
        replace: '$1',
        explanation: 'echo',
      },
      {goal: 'найди год', sample, mode: 'match'},
    )
    expect(rejected).toBeNull()
  })

  it('keeps a working AI regex', () => {
    const sample = '/Media/Library/[StudioName]clip.mp4'
    const kept = normalizeRegexAssistParsed(
      {
        pattern: '\\[([^\\]]+)\\]',
        replace: '$1',
        explanation: 'Capture brackets.',
      },
      {sample, captureText: 'StudioName', mode: 'extract'},
    )
    expect(kept).toEqual({
      pattern: '\\[([^\\]]+)\\]',
      replace: '$1',
      explanation: 'Capture brackets.',
    })
  })

  it('can synthesize regex when model returns no JSON', () => {
    const sample = '/Media/Shows/ShowName/episode.mp4'
    const synthesized = normalizeAssistParsed('regex', null, {
      sample,
      captureText: 'ShowName',
      mode: 'extract',
    })
    expect(synthesized?.pattern).toBeTruthy()
    expect(String(synthesized?.replace || '')).toContain('$1')
  })

  it('accepts goal-only regex suggestions without a sample', () => {
    const parsed = normalizeRegexAssistParsed(
      {
        pattern: '\\[([^\\]]+)\\]',
        replace: '$1',
        explanation: 'Text in brackets.',
      },
      {goal: 'text inside square brackets', mode: 'extract'},
    )
    expect(parsed?.pattern).toBe('\\[([^\\]]+)\\]')
  })

  it('shrinks path-shaped AI answers to the capture group', () => {
    const shrunk = normalizeRegexAssistParsed(
      {
        pattern: '/Media/Library/[StudioName]title_episode_(\\d{4})\\.mp4',
        replace: '$1',
        explanation: 'Find year in the filename.',
      },
      {goal: 'найди год', mode: 'match'},
    )
    expect(shrunk?.pattern).toBe('(\\d{4})')
  })

  it('builds regex and filter prompts with context', () => {
    const regexPrompt = buildRegexAssistPrompt({
      goal: 'text inside [brackets]',
      sample: '/a/[b]/c.mp4',
      captureText: 'b',
      mode: 'extract',
      pattern: '',
      replace: '$1',
    }).join('\n')
    expect(regexPrompt).toContain('Return ONLY a JSON object')
    expect(regexPrompt).toContain('PRIMARY USER REQUEST')
    expect(regexPrompt).toContain('text inside [brackets]')
    expect(regexPrompt).toContain('SHORT')
    expect(regexPrompt).not.toContain('Current pattern')
    expect(regexPrompt).not.toContain('/a/[b]/c.mp4')

    const filterPrompt = buildFilterAssistPrompt({
      pageType: 'media',
      mediaKind: 'video',
      availableFields: [{param: 'rating', type: 'number', name: 'Rating'}],
      currentFilters: [],
    }).join('\n')
    expect(filterPrompt).toContain('Rating')
    expect(filterPrompt).toContain('param="rating"')
    expect(asStringArray(['a', '', 'b', 'c'], 2)).toEqual(['a', 'b'])
  })
})
