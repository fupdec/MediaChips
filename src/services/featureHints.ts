export type FeatureHintDefinition = {
  id: string
  /** CSS selector(s) for ElementSpotlight. */
  selector: string | string[]
  titleKey: string
  bodyKey: string
  /** Prefer media list routes only. */
  routeTypes?: Array<'media'>
}

/**
 * Ordered feature coachmarks. First unseen matching hint is shown.
 */
export const FEATURE_HINTS: FeatureHintDefinition[] = [
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
