export const TAG_PAGE_DESIGNS = ['profile', 'minimal'] as const

export type TagPageDesign = typeof TAG_PAGE_DESIGNS[number]

export const DEFAULT_TAG_PAGE_DESIGN: TagPageDesign = 'profile'

export function resolveAutoTagPageDesign(options: {
  hasHeader?: boolean
  hasMain?: boolean
  hasAlt?: boolean
}): TagPageDesign {
  if (options.hasHeader || options.hasMain || options.hasAlt) {
    return 'profile'
  }
  return 'minimal'
}

export function normalizeTagPageDesign(value: unknown): TagPageDesign {
  if (value === 'minimal') {
    return 'minimal'
  }
  return DEFAULT_TAG_PAGE_DESIGN
}

export function getTagPageHeaderAspectRatio(_design: TagPageDesign): number {
  return 1400 / 609
}
