import { normalizePathForRegex } from './regexMeta'

/** One path segment; works with `/` and `\` without pre-normalization. */
export const PATH_SEGMENT_CLASS = '[^/\\\\]+'
/** `/` or `\` path separator in a stored regex string. */
export const PATH_SEP_CLASS = '[/\\\\]'

export type PathRegexPresetId =
  | 'brackets'
  | 'parentheses'
  | 'season'
  | 'folder'
  | 'folderGrandparent'
  | 'year'
  | 'date'
  | 'resolution'
  | 'id'
  | 'ext'

export type MatchRegexPresetId =
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'wholeWord'
  | 'year'
  | 'emailLike'
  | 'digits'

export type PathOsStyle = 'unix' | 'windows'

export interface PathRegexPreset {
  id: PathRegexPresetId
  pathRegex: string
  pathRegexReplace: string
  samplePath: string
  captureExample: string
}

export interface MatchRegexPreset {
  id: MatchRegexPresetId
  pattern: string
  sampleText: string
  captureExample: string
}

export interface GeneratedPathRegex {
  pathRegex: string
  pathRegexReplace: string
  kind: 'brackets' | 'parentheses' | 'season' | 'literal'
}

export interface GeneratedMatchRegex {
  pattern: string
  kind: 'literal'
}

export function detectPathOsStyle(
  env: {
    platform?: string
    userAgent?: string
    navigatorPlatform?: string
  } = {},
): PathOsStyle {
  if (env.platform != null) {
    return env.platform === 'win32' ? 'windows' : 'unix'
  }

  if (env.userAgent != null || env.navigatorPlatform != null) {
    const ua = `${env.navigatorPlatform || ''} ${env.userAgent || ''}`.toLowerCase()
    return ua.includes('win') ? 'windows' : 'unix'
  }

  if (typeof process !== 'undefined' && process.platform) {
    return process.platform === 'win32' ? 'windows' : 'unix'
  }

  if (typeof navigator !== 'undefined') {
    const browser = `${navigator.platform || ''} ${navigator.userAgent || ''}`.toLowerCase()
    return browser.includes('win') ? 'windows' : 'unix'
  }

  return 'unix'
}

function mediaRoot(os: PathOsStyle): string {
  return os === 'windows' ? 'C:/Media' : '/Media'
}

export function buildPathRegexPresets(os: PathOsStyle = detectPathOsStyle()): PathRegexPreset[] {
  const root = mediaRoot(os)

  return [
    {
      id: 'brackets',
      pathRegex: '\\[([^\\]]+)\\]',
      pathRegexReplace: '$1',
      samplePath: `${root}/Library/[StudioName]title_episode_03.mp4`,
      captureExample: 'StudioName',
    },
    {
      id: 'season',
      pathRegex: 's(\\d+)e\\d+',
      pathRegexReplace: 'Season $1',
      samplePath: `${root}/Shows/ShowName/s2e2_show_name.mp4`,
      captureExample: '2',
    },
    {
      id: 'folder',
      // Immediate parent folder; works with `/` and `\`.
      pathRegex: `(${PATH_SEGMENT_CLASS})(?=${PATH_SEP_CLASS}${PATH_SEGMENT_CLASS}$)`,
      pathRegexReplace: '$1',
      samplePath: `${root}/Shows/ShowName/episode.mp4`,
      captureExample: 'ShowName',
    },
    {
      id: 'folderGrandparent',
      // Folder two levels above the file; works with `/` and `\`.
      pathRegex: `(${PATH_SEGMENT_CLASS})(?=${PATH_SEP_CLASS}${PATH_SEGMENT_CLASS}${PATH_SEP_CLASS}${PATH_SEGMENT_CLASS}$)`,
      pathRegexReplace: '$1',
      samplePath: `${root}/Library/Shows/ShowName/episode.mp4`,
      captureExample: 'Shows',
    },
    {
      id: 'year',
      pathRegex: '((?:19|20)\\d{2})',
      pathRegexReplace: '$1',
      samplePath: `${root}/Movies/Film.Name.2019.1080p.mkv`,
      captureExample: '2019',
    },
    {
      id: 'date',
      pathRegex: '(\\d{4}-\\d{2}-\\d{2})',
      pathRegexReplace: '$1',
      samplePath: `${root}/Camera/2024-03-15_trip.mp4`,
      captureExample: '2024-03-15',
    },
    {
      id: 'resolution',
      pathRegex: '(\\d{3,4}p)',
      pathRegexReplace: '$1',
      samplePath: `${root}/Movies/Movie.Name.1080p.BluRay.mkv`,
      captureExample: '1080p',
    },
    {
      id: 'id',
      pathRegex: '_(\\d+)\\.',
      pathRegexReplace: '$1',
      samplePath: `${root}/Library/clip_0042.final.mp4`,
      captureExample: '0042',
    },
    {
      id: 'ext',
      pathRegex: '\\.([a-z0-9]+)$',
      pathRegexReplace: '$1',
      samplePath: `${root}/Videos/holiday.mkv`,
      captureExample: 'mkv',
    },
  ]
}

/** Default presets for the current environment. */
export const PATH_REGEX_PRESETS: PathRegexPreset[] = buildPathRegexPresets()

export const MATCH_REGEX_PRESETS: MatchRegexPreset[] = [
  {
    id: 'contains',
    pattern: 'Studio',
    sampleText: 'My Studio Show Episode',
    captureExample: 'Studio',
  },
  {
    id: 'startsWith',
    pattern: '^Show',
    sampleText: 'Show Name - Episode 01',
    captureExample: 'Show',
  },
  {
    id: 'endsWith',
    pattern: 'final$',
    sampleText: 'Season finale final',
    captureExample: 'final',
  },
  {
    id: 'wholeWord',
    pattern: '\\bclip\\b',
    sampleText: 'movie clip reel',
    captureExample: 'clip',
  },
  {
    id: 'year',
    pattern: '((?:19|20)\\d{2})',
    sampleText: 'Best of 2019 awards',
    captureExample: '2019',
  },
  {
    id: 'digits',
    pattern: '\\d+',
    sampleText: 'Episode 12 extended',
    captureExample: '12',
  },
  {
    id: 'emailLike',
    pattern: '[\\w.+-]+@[\\w.-]+\\.[a-z]{2,}',
    sampleText: 'Contact editor@example.com today',
    captureExample: 'editor@example.com',
  },
]

export function getDefaultPathRegexSample(os: PathOsStyle = detectPathOsStyle()) {
  const [brackets] = buildPathRegexPresets(os)
  return {
    samplePath: brackets.samplePath,
    captureText: brackets.captureExample,
  }
}

export function getDefaultMatchRegexSample() {
  const [contains] = MATCH_REGEX_PRESETS
  return {
    sampleText: contains.sampleText,
    captureText: contains.captureExample,
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Build a path regex from a sample path and the text the user wants as a tag.
 * Prefers common wrappers ([], (), sXeY) over a literal-only capture.
 */
export function generatePathRegexFromSample(
  samplePath: string,
  captureText: string,
): GeneratedPathRegex | null {
  const needle = String(captureText || '').trim()
  if (!needle) return null

  const normalized = normalizePathForRegex(samplePath)
  const lowerPath = normalized.toLowerCase()
  const lowerNeedle = needle.toLowerCase()
  const index = lowerPath.indexOf(lowerNeedle)
  if (index < 0) return null

  const before = index > 0 ? normalized[index - 1] : ''
  const afterIndex = index + needle.length
  const after = afterIndex < normalized.length ? normalized[afterIndex] : ''

  if (before === '[' && after === ']') {
    return {
      pathRegex: '\\[([^\\]]+)\\]',
      pathRegexReplace: '$1',
      kind: 'brackets',
    }
  }

  if (before === '(' && after === ')') {
    return {
      pathRegex: '\\(([^)]+)\\)',
      pathRegexReplace: '$1',
      kind: 'parentheses',
    }
  }

  if (/^\d+$/.test(needle)) {
    const seasonMatch = /s(\d+)e\d+/i.exec(normalized)
    if (seasonMatch && seasonMatch[1] === needle) {
      return {
        pathRegex: 's(\\d+)e\\d+',
        pathRegexReplace: 'Season $1',
        kind: 'season',
      }
    }
  }

  const folderMatch = new RegExp(
    `${PATH_SEP_CLASS}(${PATH_SEGMENT_CLASS})${PATH_SEP_CLASS}${PATH_SEGMENT_CLASS}$`,
    'i',
  ).exec(normalized)
  if (folderMatch && folderMatch[1].toLowerCase() === lowerNeedle) {
    return {
      pathRegex: `(${PATH_SEGMENT_CLASS})(?=${PATH_SEP_CLASS}${PATH_SEGMENT_CLASS}$)`,
      pathRegexReplace: '$1',
      kind: 'literal',
    }
  }

  return {
    pathRegex: `(${escapeRegExp(needle)})`,
    pathRegexReplace: '$1',
    kind: 'literal',
  }
}

/**
 * Build a match regex from sample text and the fragment that should match.
 */
export function generateMatchRegexFromSample(
  sampleText: string,
  captureText: string,
): GeneratedMatchRegex | null {
  const needle = String(captureText || '').trim()
  if (!needle) return null

  const sample = String(sampleText || '')
  if (!sample.toLowerCase().includes(needle.toLowerCase())) return null

  return {
    pattern: escapeRegExp(needle),
    kind: 'literal',
  }
}

export type RegexHelperSnippetId =
  | 'any'
  | 'digits'
  | 'word'
  | 'capture'
  | 'segment'
  | 'space'
  | 'optional'
  | 'or'
  | 'start'
  | 'dot'
  | 'end'

export interface RegexHelperSnippet {
  id: RegexHelperSnippetId
  insert: string
}

/** Named helper chips shown in the pattern toolbar. */
export const REGEX_HELPER_SNIPPETS: RegexHelperSnippet[] = [
  {id: 'any', insert: '.*?'},
  {id: 'digits', insert: '\\d+'},
  {id: 'word', insert: '\\w+'},
  {id: 'segment', insert: PATH_SEGMENT_CLASS},
  {id: 'capture', insert: '(.*?)'},
  {id: 'space', insert: '\\s+'},
  {id: 'optional', insert: '?'},
  {id: 'or', insert: '|'},
  {id: 'start', insert: '^'},
  {id: 'end', insert: '$'},
  {id: 'dot', insert: '\\.'},
]
