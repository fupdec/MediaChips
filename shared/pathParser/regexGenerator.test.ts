/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'

import {
  buildPathRegexPresets,
  detectPathOsStyle,
  generatePathRegexFromSample,
} from './regexGenerator'
import { extractPathRegexTagName } from './regexMeta'

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
})
