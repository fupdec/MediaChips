import {parseGridTileIndex} from '@shared/videoPreview'

export type SimilarMatchKind = 'grid' | 'clip' | 'tags'

export const SIMILAR_MATCH_ICONS: Record<SimilarMatchKind, string> = {
  grid: 'mdi-view-grid-outline',
  clip: 'mdi-creation-outline',
  tags: 'mdi-tag-outline',
}

type SimilarMatchSource = {
  semanticTileIndex?: unknown
  similarity?: {
    tileIndex?: unknown
    signals?: {
      clip?: unknown
      tags?: unknown
    }
  } | null
}

function hasSimilaritySignal(value: unknown): boolean {
  return value != null && value !== '' && Number.isFinite(Number(value))
}

/** Which Similar signals explain a neighbor card (grid frame, look, tags). */
export function listSimilarMatchKinds(
  item: SimilarMatchSource | null | undefined,
): SimilarMatchKind[] {
  if (!item) return []

  const signals = item.similarity?.signals
  const hasGrid = parseGridTileIndex(
    item.similarity?.tileIndex ?? item.semanticTileIndex,
  ) != null
  const hasClip = hasGrid || hasSimilaritySignal(signals?.clip)
  const hasTags = hasSimilaritySignal(signals?.tags)

  const kinds: SimilarMatchKind[] = []
  if (hasGrid) kinds.push('grid')
  else if (hasClip) kinds.push('clip')
  if (hasTags) kinds.push('tags')
  return kinds
}

export function similarMatchTooltipKey(kinds: SimilarMatchKind[]): string | null {
  if (!kinds.length) return null
  return `home.widgets.similar_match_${kinds.join('_')}`
}
