export const TAG_PAGE_DESIGNS = ['profile', 'compact', 'minimal'] as const

export type TagPageDesign = typeof TAG_PAGE_DESIGNS[number]

export const DEFAULT_TAG_PAGE_DESIGN: TagPageDesign = 'profile'

export interface TagPageDesignOption {
  value: TagPageDesign
  icon: string
  labelKey: string
  hintKey: string
}

export const TAG_PAGE_DESIGN_OPTIONS: TagPageDesignOption[] = [
  {
    value: 'profile',
    icon: 'mdi-card-account-details-outline',
    labelKey: 'meta.settings.tag_page_design_profile',
    hintKey: 'meta.settings.tag_page_design_profile_hint',
  },
  {
    value: 'compact',
    icon: 'mdi-view-compact-outline',
    labelKey: 'meta.settings.tag_page_design_compact',
    hintKey: 'meta.settings.tag_page_design_compact_hint',
  },
  {
    value: 'minimal',
    icon: 'mdi-minus-box-outline',
    labelKey: 'meta.settings.tag_page_design_minimal',
    hintKey: 'meta.settings.tag_page_design_minimal_hint',
  },
]

export function normalizeTagPageDesign(value: unknown): TagPageDesign {
  if (value === 'compact' || value === 'minimal') {
    return value
  }
  return DEFAULT_TAG_PAGE_DESIGN
}

export function getTagPageHeaderAspectRatio(design: TagPageDesign): number {
  if (design === 'compact') {
    return 16 / 4
  }
  return 1400 / 609
}
