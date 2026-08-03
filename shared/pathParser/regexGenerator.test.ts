/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'

import {
  MATCH_REGEX_PRESETS,
  buildPathRegexPresets,
  detectPathOsStyle,
  generateMatchRegexFromSample,
  generatePathRegexFromSample,
} from './regexGenerator'
import { extractPathRegexTagName, testRegexMatch } from './regexMeta'

describe('pathParser/regexGenerator', () => {
  it('detects windows and unix styles', () => {
    expect(detectPathOsStyle({platform: 'win32'})).toBe('windows')
    expect(detectPathOsStyle({platform: 'darwin'})).toBe('unix')
    expect(detectPathOsStyle({userAgent: 'Mozilla Windows'})).toBe('windows')
  })

  it('builds OS-specific sample roots', () => {
    expect(buildPathRegexPresets('unix')[0].samplePath).toBe(
      '/Media/Library/[StudioName]title_episode_03.mp4',
    )
    expect(buildPathRegexPresets('windows')[0].samplePath).toBe(
      'C:/Media/Library/[StudioName]title_episode_03.mp4',
    )
  })

  it('generates brackets pattern and extracts the studio', () => {
    const generated = generatePathRegexFromSample(
      '/Media/Library/[StudioName]clip.mp4',
      'StudioName',
    )
    expect(generated).toEqual({
      pathRegex: '\\[([^\\]]+)\\]',
      pathRegexReplace: '$1',
      kind: 'brackets',
    })
    expect(extractPathRegexTagName('/Media/Library/[StudioName]clip.mp4', {
      id: 1,
      type: 'array',
      parser: true,
      pathRegex: generated!.pathRegex,
      pathRegexReplace: generated!.pathRegexReplace,
    })).toBe('StudioName')
  })

  it('generates season pattern from digit capture', () => {
    const generated = generatePathRegexFromSample(
      '/Media/Shows/ShowName/s2e2_show_name.mp4',
      '2',
    )
    expect(generated?.kind).toBe('season')
    expect(extractPathRegexTagName('/Media/Shows/ShowName/s2e2_show_name.mp4', {
      id: 1,
      type: 'array',
      parser: true,
      pathRegex: generated!.pathRegex,
      pathRegexReplace: generated!.pathRegexReplace,
    })).toBe('Season 2')
  })

  it('returns null when capture text is not in the path', () => {
    expect(generatePathRegexFromSample('/a/b.mp4', 'Missing')).toBeNull()
  })

  it('generates escaped match pattern from sample', () => {
    const generated = generateMatchRegexFromSample('My Studio Show', 'Studio')
    expect(generated).toEqual({pattern: 'Studio', kind: 'literal'})
    expect(testRegexMatch(generated!.pattern, 'My Studio Show', 'i').ok).toBe(true)
  })

  it('escapes special characters in match generator', () => {
    const generated = generateMatchRegexFromSample('file (1).mp4', '(1)')
    expect(generated?.pattern).toBe('\\(1\\)')
    expect(testRegexMatch(generated!.pattern, 'file (1).mp4', 'i').ok).toBe(true)
  })

  it('returns null when match capture is missing', () => {
    expect(generateMatchRegexFromSample('abc', 'xyz')).toBeNull()
  })

  it('exposes generic match presets', () => {
    expect(MATCH_REGEX_PRESETS.map((preset) => preset.id)).toEqual([
      'contains',
      'startsWith',
      'endsWith',
      'wholeWord',
      'year',
      'digits',
      'emailLike',
    ])
  })

  it('exposes diverse path presets with a single studio option', () => {
    const ids = buildPathRegexPresets('unix').map((preset) => preset.id)
    expect(ids).toEqual([
      'brackets',
      'season',
      'folder',
      'year',
      'date',
      'resolution',
      'id',
      'ext',
    ])
    expect(ids.filter((id) => id === 'brackets' || id === 'parentheses')).toEqual(['brackets'])
  })

  it('year preset extracts a 4-digit year', () => {
    const year = buildPathRegexPresets('unix').find((preset) => preset.id === 'year')
    expect(year).toBeTruthy()
    expect(extractPathRegexTagName(year!.samplePath, {
      id: 1,
      type: 'array',
      parser: true,
      pathRegex: year!.pathRegex,
      pathRegexReplace: year!.pathRegexReplace,
    })).toBe('2019')
  })

  it('folder preset extracts the parent folder name of the file', () => {
    const folder = buildPathRegexPresets('unix').find((preset) => preset.id === 'folder')
    expect(folder).toBeTruthy()
    expect(testRegexMatch(folder!.pathRegex, folder!.samplePath, 'iu')).toEqual({
      ok: true,
      matched: 'ShowName',
      groups: ['ShowName'],
    })
    expect(extractPathRegexTagName(folder!.samplePath, {
      id: 1,
      type: 'array',
      parser: true,
      pathRegex: folder!.pathRegex,
      pathRegexReplace: folder!.pathRegexReplace,
    })).toBe('ShowName')
    expect(extractPathRegexTagName(
      'C:\\Media\\Shows\\ShowName\\episode.mp4',
      {
        id: 1,
        type: 'array',
        parser: true,
        pathRegex: folder!.pathRegex,
        pathRegexReplace: folder!.pathRegexReplace,
      },
    )).toBe('ShowName')
  })
})
