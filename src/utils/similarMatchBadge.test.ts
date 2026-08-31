import {describe, expect, it} from 'vitest'
import {
  SIMILAR_MATCH_ICONS,
  listSimilarMatchKinds,
  similarMatchTooltipKey,
} from './similarMatchBadge'

describe('listSimilarMatchKinds', () => {
  it('returns nothing without similarity signals', () => {
    expect(listSimilarMatchKinds(null)).toEqual([])
    expect(listSimilarMatchKinds({})).toEqual([])
    expect(listSimilarMatchKinds({similarity: {score: 1}})).toEqual([])
  })

  it('uses a grid badge when CLIP matched a grid tile', () => {
    expect(listSimilarMatchKinds({
      semanticTileIndex: 7,
      similarity: {signals: {clip: 0.91}, tileIndex: 7},
    })).toEqual(['grid'])
  })

  it('uses an appearance badge when CLIP matched without a grid tile', () => {
    expect(listSimilarMatchKinds({
      similarity: {signals: {clip: 0.8}},
    })).toEqual(['clip'])
  })

  it('uses a tags badge for tag-only neighbors', () => {
    expect(listSimilarMatchKinds({
      similarity: {signals: {tags: 0.4}},
    })).toEqual(['tags'])
  })

  it('combines grid or appearance with tags', () => {
    expect(listSimilarMatchKinds({
      similarity: {signals: {clip: 0.9, tags: 0.3}, tileIndex: 2},
    })).toEqual(['grid', 'tags'])
    expect(listSimilarMatchKinds({
      similarity: {signals: {clip: 0.7, tags: 0.5}},
    })).toEqual(['clip', 'tags'])
  })
})

describe('similarMatchTooltipKey', () => {
  it('maps kinds to i18n keys', () => {
    expect(similarMatchTooltipKey([])).toBeNull()
    expect(similarMatchTooltipKey(['grid'])).toBe('home.widgets.similar_match_grid')
    expect(similarMatchTooltipKey(['clip', 'tags'])).toBe('home.widgets.similar_match_clip_tags')
  })

  it('keeps a distinct icon per kind', () => {
    expect(SIMILAR_MATCH_ICONS.grid).toContain('grid')
    expect(SIMILAR_MATCH_ICONS.clip).toContain('creation')
    expect(SIMILAR_MATCH_ICONS.tags).toContain('tag')
  })
})
