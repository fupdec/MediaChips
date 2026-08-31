export type FeatureHintDefinition = {
  id: string
  /** CSS selector(s) for ElementSpotlight. */
  selector: string | string[]
  titleKey: string
  bodyKey: string
  /** Prefer media list routes only. */
  routeTypes?: Array<'media'>
  /** Expand the browser sidebar before measuring the target. */
  ensureSidebarExpanded?: boolean
}

/**
 * Ordered feature coachmarks. First unseen matching hint is shown.
 */
export const FEATURE_HINTS: FeatureHintDefinition[] = [
  {
    id: 'edit-library-nav',
    selector: '[data-feature-hint="edit-library-nav"]',
    titleKey: 'feature_hints.edit_library_nav_title',
    bodyKey: 'feature_hints.edit_library_nav_body',
    ensureSidebarExpanded: true,
  },
  {
    id: 'drag-tags-between-cards',
    selector: '[data-feature-hint="drag-tags"]',
    titleKey: 'feature_hints.drag_tags_title',
    bodyKey: 'feature_hints.drag_tags_body',
    routeTypes: ['media'],
  },
]

export function getFeatureHintById(id: string): FeatureHintDefinition | undefined {
  return FEATURE_HINTS.find((hint) => hint.id === id)
}
