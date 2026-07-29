import { normalizePathForRegex } from './regexMeta'

export type PathRegexPresetId =
  | 'brackets'
  | 'parentheses'
  | 'season'
  | 'folder'

export type PathOsStyle = 'unix' | 'windows'

export interface PathRegexPreset {
  id: PathRegexPresetId
  pathRegex: string
  pathRegexReplace: string
  samplePath: string
  captureExample: string
}

export interface GeneratedPathRegex {
  pathRegex: string
  pathRegexReplace: string
  kind: 'brackets' | 'parentheses' | 'season' | 'literal'
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
      id: 'parentheses',
      pathRegex: '\\(([^)]+)\\)',
      pathRegexReplace: '$1',
      samplePath: `${root}/Library/(NetworkName)/scene_01.mp4`,
      captureExample: 'NetworkName',
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
      pathRegex: '/([^/]+)/[^/]+$',
      pathRegexReplace: '$1',
      samplePath: `${root}/Shows/ShowName/episode.mp4`,
      captureExample: 'ShowName',
    },
  ]
}

/** Default presets for the current environment. */
export const PATH_REGEX_PRESETS: PathRegexPreset[] = buildPathRegexPresets()

export function getDefaultPathRegexSample(os: PathOsStyle = detectPathOsStyle()) {
  const [brackets] = buildPathRegexPresets(os)
  return {
    samplePath: brackets.samplePath,
    captureText: brackets.captureExample,
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

  const folderMatch = /\/([^/]+)\/[^/]+$/.exec(normalized)
  if (folderMatch && folderMatch[1].toLowerCase() === lowerNeedle) {
    return {
      pathRegex: '/([^/]+)/[^/]+$',
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
