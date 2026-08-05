import {describe, expect, it} from 'vitest'
import {
  DEFAULT_HOME_WIDGETS_CONFIG,
  HOME_WIDGET_IDS,
  mergeHomeWidgetsConfig,
  parseHomeWidgetsConfig,
  serializeHomeWidgetsConfig,
  setHomeWidgetCollapsed,
} from './homeWidgets'

describe('parseHomeWidgetsConfig', () => {
  it('returns defaults for empty or invalid input', () => {
    expect(parseHomeWidgetsConfig(null)).toEqual(DEFAULT_HOME_WIDGETS_CONFIG)
    expect(parseHomeWidgetsConfig(undefined)).toEqual(DEFAULT_HOME_WIDGETS_CONFIG)
    expect(parseHomeWidgetsConfig('{not-json')).toEqual(DEFAULT_HOME_WIDGETS_CONFIG)
  })

  it('parses JSON strings through merge', () => {
    const raw = JSON.stringify({
      enabled: {stats: true},
      limits: {continue: 20},
    })
    const parsed = parseHomeWidgetsConfig(raw)
    expect(parsed.enabled.stats).toBe(true)
    expect(parsed.limits.continue).toBe(20)
    expect(parsed.order).toEqual(DEFAULT_HOME_WIDGETS_CONFIG.order)
  })
})

describe('mergeHomeWidgetsConfig', () => {
  it('drops unknown order ids and appends missing known widgets', () => {
    const merged = mergeHomeWidgetsConfig({
      order: ['continue', 'not-a-widget', 'favorites'] as never,
    })
    expect(merged.order[0]).toBe('continue')
    expect(merged.order[1]).toBe('favorites')
    expect(merged.order).not.toContain('not-a-widget')
    expect(merged.order).toEqual(expect.arrayContaining([...HOME_WIDGET_IDS]))
    expect(new Set(merged.order).size).toBe(HOME_WIDGET_IDS.length)
  })

  it('clamps limits between 4 and 24', () => {
    const merged = mergeHomeWidgetsConfig({
      limits: {
        continue: 2,
        favorites: 100,
        topViews: 12.6,
        markers: Number.NaN,
        topTags: 8,
      },
    })
    expect(merged.limits.continue).toBe(4)
    expect(merged.limits.favorites).toBe(24)
    expect(merged.limits.topViews).toBe(13)
    expect(merged.limits.markers).toBe(DEFAULT_HOME_WIDGETS_CONFIG.limits.markers)
    expect(merged.limits.topTags).toBe(8)
  })

  it('ignores non-boolean enabled and collapsed values', () => {
    const merged = mergeHomeWidgetsConfig({
      enabled: {stats: 'yes', favorites: false} as never,
      collapsed: {extendedStats: 'no'} as never,
    })
    expect(merged.enabled.stats).toBe(DEFAULT_HOME_WIDGETS_CONFIG.enabled.stats)
    expect(merged.enabled.favorites).toBe(false)
    expect(merged.collapsed.extendedStats).toBe(
      DEFAULT_HOME_WIDGETS_CONFIG.collapsed.extendedStats,
    )
  })
})

describe('serializeHomeWidgetsConfig / setHomeWidgetCollapsed', () => {
  it('round-trips through serialize', () => {
    const serialized = serializeHomeWidgetsConfig({
      enabled: {health: true},
      limits: {markers: 16},
    })
    const parsed = parseHomeWidgetsConfig(serialized)
    expect(parsed.enabled.health).toBe(true)
    expect(parsed.limits.markers).toBe(16)
  })

  it('updates known collapsed keys only', () => {
    const next = setHomeWidgetCollapsed(null, 'extendedStats', true)
    expect(parseHomeWidgetsConfig(next).collapsed.extendedStats).toBe(true)

    const unchanged = setHomeWidgetCollapsed(next, 'unknownWidget', true)
    expect(unchanged).toBe(serializeHomeWidgetsConfig(parseHomeWidgetsConfig(next)))
  })
})
