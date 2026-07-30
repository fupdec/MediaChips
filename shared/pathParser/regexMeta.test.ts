/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'

import {
  applyPathRegexReplace,
  extractPathRegexTagName,
  extractPathRegexTagNames,
  normalizePathForRegex,
  validatePathRegex,
} from './regexMeta'

describe('pathParser/regexMeta', () => {
  it('normalizes Windows separators', () => {
    expect(normalizePathForRegex('C:\\Media\\Library\\file.mp4')).toBe(
      'C:/Media/Library/file.mp4',
    )
  })

  it('extracts studio from square brackets', () => {
    const tagName = extractPathRegexTagName(
      '/Media/Library/[StudioName]title_episode_03.mp4',
      {
        id: 10,
        type: 'array',
        parser: true,
        pathRegex: '\\[([^\\]]+)\\]',
        pathRegexReplace: '$1',
      },
    )
    expect(tagName).toBe('StudioName')
  })

  it('extracts studio names that contain spaces', () => {
    const tagName = extractPathRegexTagName(
      '/Media/Library/[Studio COP]scene.mp4',
      {
        id: 10,
        type: 'array',
        parser: true,
        pathRegex: '\\[([^\\]]+)\\]',
        pathRegexReplace: '$1',
      },
    )
    expect(tagName).toBe('Studio COP')
  })

  it('extracts season with template', () => {
    const tagName = extractPathRegexTagName(
      '/Media/Shows/ShowName/s2e2_show_name.mp4',
      {
        id: 11,
        type: 'array',
        parser: true,
        pathRegex: 's(\\d+)e\\d+',
        pathRegexReplace: 'Season $1',
      },
    )
    expect(tagName).toBe('Season 2')
  })

  it('works with backslash paths', () => {
    const tagName = extractPathRegexTagName(
      'C:\\Media\\Shows\\ShowName\\s2e2_show_name.mp4',
      {
        id: 11,
        type: 'array',
        parser: true,
        pathRegex: 's(\\d+)e\\d+',
        pathRegexReplace: 'Season $1',
      },
    )
    expect(tagName).toBe('Season 2')
  })

  it('rejects invalid regex', () => {
    const result = validatePathRegex('(')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('Invalid regex')
    }
  })

  it('applies multi-group replace and escapes $$', () => {
    const match = /s(\d+)e(\d+)/iu.exec('s2e2')
    expect(match).toBeTruthy()
    expect(applyPathRegexReplace(match!, 'S$1E$2')).toBe('S2E2')
    expect(applyPathRegexReplace(match!, '$$1')).toBe('$1')
  })

  it('skips ineligible metas and empty captures', () => {
    const results = extractPathRegexTagNames('/Media/Library/clip.mp4', [
      {id: 1, type: 'string', parser: true, pathRegex: 'clip'},
      {id: 2, type: 'array', parser: false, pathRegex: 'clip'},
      {id: 3, type: 'array', parser: true, pathRegex: ''},
      {
        id: 4,
        type: 'array',
        parser: true,
        pathRegex: '(nomatch)',
        pathRegexReplace: '$1',
      },
    ])
    expect(results).toEqual([])
  })

  it('skips metas with pathRegexEnabled turned off', () => {
    const results = extractPathRegexTagNames('/Media/Library/[StudioName]clip.mp4', [{
      id: 6,
      type: 'array',
      parser: true,
      pathRegex: '\\[([^\\]]+)\\]',
      pathRegexReplace: '$1',
      pathRegexEnabled: false,
    }])
    expect(results).toEqual([])
  })

  it('returns createTags flag from meta setting', () => {
    const [hit] = extractPathRegexTagNames('/Media/Library/[StudioName]clip.mp4', [{
      id: 5,
      type: 'array',
      parser: true,
      pathRegex: '\\[([^\\]]+)\\]',
      pathRegexReplace: '$1',
      pathRegexCreateTags: false,
    }])
    expect(hit).toEqual({
      metaId: 5,
      tagName: 'StudioName',
      createTags: false,
      source: 'regex',
    })
  })
})
