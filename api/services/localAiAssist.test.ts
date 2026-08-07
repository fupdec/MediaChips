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
      filters: [],
    })
  })

  it('validates structured filters against available fields', () => {
    const parsed = normalizeFilterAssistParsed({
      summary: 'High-rated favorites',
      filters: [
        {param: 'favorite', type: 'boolean', cond: '=', val: 'yes'},
        {param: 'Rating', type: 'rating', cond: '≥', val: '4'},
        {param: 'unknown', type: 'string', cond: 'like', val: 'x'},
        {param: 'rating', type: 'rating', cond: '???', val: 3},
      ],
    }, {
      availableFields: [
        {param: 'favorite', type: 'boolean', name: 'Favorite'},
        {param: 'rating', type: 'rating', name: 'Rating'},
      ],
    })
    expect(parsed?.filters).toEqual([
      {param: 'favorite', type: 'boolean', cond: '=', val: true, active: true},
      {param: 'rating', type: 'rating', cond: '>=', val: 4, active: true},
    ])
  })

  it('repairs boolean NO encoded as = false and keeps !=', () => {
    const parsed = normalizeFilterAssistParsed({
      summary: 'Not favorite',
      filters: [
        {param: 'favorite', type: 'boolean', cond: '=', val: false},
        {param: 'favorite', type: 'boolean', cond: '!=', val: true},
      ],
    }, {
      availableFields: [{param: 'favorite', type: 'boolean', name: 'Favorite'}],
    })
    expect(parsed?.filters).toEqual([
      {param: 'favorite', type: 'boolean', cond: '!=', val: false, active: true},
    ])
  })

  it('repairs watch/month goals away from favorite + views mistakes', () => {
    const parsed = normalizeFilterAssistParsed({
      summary: 'Wrong favorite views',
      filters: [
        {param: 'favorite', type: 'boolean', cond: '=', val: false},
        {param: 'views', type: 'number', cond: '<', val: 30},
      ],
      suggestions: ['Add a month filter'],
      explanation: 'Favorites',
    }, {
      today: '2026-08-07',
      goal: 'не смотрел месяц',
      availableFields: [
        {param: 'favorite', type: 'boolean', name: 'Favorite'},
        {param: 'views', type: 'number', name: 'Views'},
        {param: 'viewedAt', type: 'date', name: 'Viewed'},
      ],
    })
    expect(parsed?.filters).toEqual([
      {param: 'viewedAt', type: 'date', cond: '<', val: '2026-07-08', active: true},
    ])
  })

  it('keeps favorite when the goal asks for favorites', () => {
    const parsed = normalizeFilterAssistParsed({
      summary: 'Favorites',
      filters: [{param: 'favorite', type: 'boolean', cond: '=', val: true}],
    }, {
      goal: 'избранное',
      availableFields: [{param: 'favorite', type: 'boolean', name: 'Favorite'}],
    })
    expect(parsed?.filters).toEqual([
      {param: 'favorite', type: 'boolean', cond: '=', val: true, active: true},
    ])
  })

  it('returns null for empty filter payloads', () => {
    expect(normalizeFilterAssistParsed(null)).toBeNull()
    expect(normalizeFilterAssistParsed({summary: '  '})).toBeNull()
  })

  it('synthesizes viewedAt from goal even when model JSON is missing', () => {
    const parsed = normalizeFilterAssistParsed(null, {
      today: '2026-08-07',
      goal: 'не смотрел месяц',
      availableFields: [
        {param: 'favorite', type: 'boolean', name: 'Favorite'},
        {param: 'views', type: 'number', name: 'Views'},
        {param: 'viewedAt', type: 'date', name: 'Viewed'},
      ],
    })
    expect(parsed?.filters).toEqual([
      {param: 'viewedAt', type: 'date', cond: '<', val: '2026-07-08', active: true},
    ])
  })

  it('synthesizes calendar-month watch filters', () => {
    const parsed = normalizeFilterAssistParsed(null, {
      today: '2026-08-07',
      goal: 'смотрел в этом месяце',
      availableFields: [{param: 'viewedAt', type: 'date', name: 'Viewed'}],
    })
    expect(parsed?.filters).toEqual([
      {param: 'viewedAt', type: 'date', cond: '>=', val: '2026-08-01', active: true},
    ])
  })

  it('synthesizes rating and favorite from goal', () => {
    const parsed = normalizeFilterAssistParsed(null, {
      goal: 'избранное и рейтинг > 4',
      availableFields: [
        {param: 'favorite', type: 'boolean', name: 'Favorite'},
        {param: 'rating', type: 'number', name: 'Rating'},
      ],
    })
    expect(parsed?.filters).toEqual([
      {param: 'favorite', type: 'boolean', cond: '=', val: true, active: true},
      {param: 'rating', type: 'number', cond: '>', val: 4, active: true},
    ])
  })

  it('synthesizes never-watched as views = 0', () => {
    const parsed = normalizeFilterAssistParsed(null, {
      goal: 'никогда не смотрел',
      availableFields: [
        {param: 'views', type: 'number', name: 'Views'},
        {param: 'viewedAt', type: 'date', name: 'Viewed'},
      ],
    })
    expect(parsed?.filters).toEqual([
      {param: 'views', type: 'number', cond: '=', val: 0, active: true},
    ])
  })

  it('synthesizes resolution, name, and tagged meta fields', () => {
    const parsed = normalizeFilterAssistParsed(null, {
      goal: '1080p, имя: clash, Girls: Lara Onyx, Tags: blonde',
      availableFields: [
        {param: 'height', type: 'number', name: 'Height'},
        {param: 'name', type: 'string', name: 'Name'},
        {param: 17, type: 'array', name: 'Girls'},
        {param: 18, type: 'array', name: 'Tags'},
      ],
    })
    expect(parsed?.filters).toEqual([
      {param: 'name', type: 'string', cond: 'like', val: 'clash', active: true},
      {param: 'height', type: 'number', cond: '>=', val: 1080, active: true},
      {param: 17, type: 'array', cond: 'in', val: ['Lara Onyx'], active: true},
      {param: 18, type: 'array', cond: 'in', val: ['blonde'], active: true},
    ])
  })

  it('synthesizes empty meta fields as is null', () => {
    const parsed = normalizeFilterAssistParsed(null, {
      goal: 'без Tags',
      availableFields: [{param: 18, type: 'array', name: 'Tags'}],
    })
    expect(parsed?.filters).toEqual([
      {param: 18, type: 'array', cond: 'is null', val: null, active: true},
    ])
  })

  it('synthesizes duration ranges, filesize and extensions', () => {
    const parsed = normalizeFilterAssistParsed(null, {
      goal: 'от 10 до 20 минут, размер > 500mb, mp4',
      availableFields: [
        {param: 'duration', type: 'number', name: 'Duration'},
        {param: 'filesize', type: 'number', name: 'File size'},
        {param: 'ext', type: 'array', name: 'File format'},
      ],
    })
    expect(parsed?.filters).toEqual([
      {param: 'duration', type: 'number', cond: '>=', val: 600, active: true},
      {param: 'duration', type: 'number', cond: '<=', val: 1200, active: true},
      {param: 'filesize', type: 'number', cond: '>', val: 500 * 1024 * 1024, active: true},
      {param: 'ext', type: 'array', cond: 'in', val: ['mp4'], active: true},
    ])
  })

  it('builds an instant local suggestion when the goal is fully covered', async () => {
    const {buildLocalFilterAssistSuggestion} = await import('../../shared/localAiAssistFilterGoal')
    const local = buildLocalFilterAssistSuggestion({
      today: '2026-08-07',
      goal: 'не смотрел месяц, избранное, 1080p',
      availableFields: [
        {param: 'viewedAt', type: 'date', name: 'Viewed'},
        {param: 'favorite', type: 'boolean', name: 'Favorite'},
        {param: 'height', type: 'number', name: 'Height'},
      ],
    })
    expect(local?.local).toBe(true)
    expect(local?.filters).toEqual([
      {param: 'favorite', type: 'boolean', cond: '=', val: true, active: true},
      {param: 'viewedAt', type: 'date', cond: '<', val: '2026-07-08', active: true},
      {param: 'height', type: 'number', cond: '>=', val: 1080, active: true},
    ])
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
      today: '2026-08-07',
      availableFields: [{param: 'rating', type: 'number', name: 'Rating'}],
      currentFilters: [],
      goal: 'rating > 4 and favorite',
    }).join('\n')
    expect(filterPrompt).toContain('Rating')
    expect(filterPrompt).toContain('param="rating"')
    expect(filterPrompt).toContain('PRIMARY USER REQUEST')
    expect(filterPrompt).toContain('filters')
    expect(filterPrompt).toContain('viewedAt')
    expect(filterPrompt).toContain('2026-08-07')
    expect(filterPrompt).toContain('2026-07-08')
    expect(asStringArray(['a', '', 'b', 'c'], 2)).toEqual(['a', 'b'])
  })

  it('covers one-tap example goals locally', async () => {
    const {buildLocalFilterAssistSuggestion} = await import('../../shared/localAiAssistFilterGoal')
    const availableFields = [
      {param: 'viewedAt', type: 'date', name: 'Viewed'},
      {param: 'favorite', type: 'boolean', name: 'Favorite'},
      {param: 'rating', type: 'number', name: 'Rating'},
      {param: 'duration', type: 'number', name: 'Duration'},
      {param: 'height', type: 'number', name: 'Height'},
      {param: 'time', type: 'number', name: 'Resume'},
      {param: 'views', type: 'number', name: 'Views'},
      {param: 'createdAt', type: 'date', name: 'Added'},
      {param: 18, type: 'array', name: 'Tags'},
    ]
    for (const goal of [
      'не смотрел месяц',
      '10-20 min',
      'empty Tags',
      'favorite, rating > 4',
      '1080p',
      'недосмотренные',
      'добавлен на этой неделе',
      'просмотры > 5',
    ]) {
      const local = buildLocalFilterAssistSuggestion({
        today: '2026-08-07',
        goal,
        availableFields,
      })
      expect(local, goal).toBeTruthy()
      const filters = Array.isArray(local?.filters) ? local!.filters : []
      expect(filters.length).toBeGreaterThan(0)
      expect(local!.local).toBe(true)
    }
  })

  it('builds a partial local suggestion when only part of the goal is covered', async () => {
    const {buildLocalFilterAssistSuggestion} = await import('../../shared/localAiAssistFilterGoal')
    const local = buildLocalFilterAssistSuggestion({
      today: '2026-08-07',
      goal: 'не смотрел месяц и похожие на sunset vibe',
      availableFields: [
        {param: 'viewedAt', type: 'date', name: 'Viewed'},
      ],
    }, {allowPartial: true})
    expect(local).toBeTruthy()
    expect(local!.partial).toBe(true)
    const filters = Array.isArray(local?.filters) ? local!.filters : []
    expect(filters.some((row) => String((row as {param?: unknown}).param) === 'viewedAt')).toBe(true)
    expect(String(local!.residual || '')).toMatch(/sunset|vibe/i)
    expect(buildLocalFilterAssistSuggestion({
      today: '2026-08-07',
      goal: 'не смотрел месяц и похожие на sunset vibe',
      availableFields: [
        {param: 'viewedAt', type: 'date', name: 'Viewed'},
      ],
    })).toBeNull()
  })

  it('synthesizes resume progress, views count and added date', async () => {
    const {synthesizeFiltersFromGoal, buildLocalFilterAssistSuggestion} = await import('../../shared/localAiAssistFilterGoal')
    const availableFields = [
      {param: 'time', type: 'number', name: 'Resume'},
      {param: 'views', type: 'number', name: 'Views'},
      {param: 'createdAt', type: 'date', name: 'Added'},
      {param: 'updatedAt', type: 'date', name: 'Updated'},
    ]
    expect(synthesizeFiltersFromGoal({
      today: '2026-08-07',
      goal: 'недосмотренные',
      availableFields,
    })).toEqual([
      {param: 'time', type: 'number', cond: '>', val: 0, active: true},
    ])
    expect(synthesizeFiltersFromGoal({
      today: '2026-08-07',
      goal: 'просмотры > 5',
      availableFields,
    })).toEqual([
      {param: 'views', type: 'number', cond: '>', val: 5, active: true},
    ])
    expect(synthesizeFiltersFromGoal({
      today: '2026-08-07',
      goal: 'добавлен на этой неделе',
      availableFields,
    })).toEqual([
      {param: 'createdAt', type: 'date', cond: '>=', val: '2026-08-03', active: true},
    ])
    expect(synthesizeFiltersFromGoal({
      today: '2026-08-07',
      goal: 'редактировал в этом месяце',
      availableFields,
    })).toEqual([
      {param: 'updatedAt', type: 'date', cond: '>=', val: '2026-08-01', active: true},
    ])
    const local = buildLocalFilterAssistSuggestion({
      today: '2026-08-07',
      goal: 'недосмотренные, просмотры > 1',
      availableFields,
    })
    expect(local?.local).toBe(true)
    expect(local?.partial).toBe(false)
  })

  it('synthesizes codec, bitrate, fps, exact height and excluded tags', async () => {
    const {synthesizeFiltersFromGoal, buildLocalFilterAssistSuggestion} = await import('../../shared/localAiAssistFilterGoal')
    const availableFields = [
      {param: 'codec', type: 'string', name: 'Codec'},
      {param: 'bitrate', type: 'number', name: 'Bitrate'},
      {param: 'fps', type: 'number', name: 'FPS'},
      {param: 'height', type: 'number', name: 'Height'},
      {param: 18, type: 'array', name: 'Tags'},
    ]
    expect(synthesizeFiltersFromGoal({
      today: '2026-08-07',
      goal: 'hevc, bitrate > 5 mbps, 60 fps',
      availableFields,
    })).toEqual([
      {param: 'codec', type: 'string', cond: 'like', val: 'hevc', active: true},
      {param: 'bitrate', type: 'number', cond: '>', val: 5000, active: true},
      {param: 'fps', type: 'number', cond: '>=', val: 60, active: true},
    ])
    expect(synthesizeFiltersFromGoal({
      today: '2026-08-07',
      goal: 'только 1080p',
      availableFields,
    })).toEqual([
      {param: 'height', type: 'number', cond: '=', val: 1080, active: true},
    ])
    expect(synthesizeFiltersFromGoal({
      today: '2026-08-07',
      goal: 'кроме Tags: Lara',
      availableFields,
    })).toEqual([
      {param: 18, type: 'array', cond: 'not in', val: ['Lara'], active: true},
    ])
    expect(buildLocalFilterAssistSuggestion({
      today: '2026-08-07',
      goal: 'hevc, 60 fps',
      availableFields,
    })?.local).toBe(true)
  })
})
