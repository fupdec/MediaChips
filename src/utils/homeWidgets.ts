export const HOME_WIDGET_IDS = [
  'stats',
  'extendedStats',
  'chartStats',
  'createdCalendar',
  'quickActions',
  'inbox',
  'continue',
  'similar',
  'favorites',
  'topViews',
  'markers',
  'health',
  'topTags',
] as const

export type HomeWidgetId = typeof HOME_WIDGET_IDS[number]

export const HOME_WIDGETS_WITH_LIMIT = [
  'inbox',
  'continue',
  'similar',
  'favorites',
  'topViews',
  'markers',
  'topTags',
] as const

export type HomeWidgetWithLimit = typeof HOME_WIDGETS_WITH_LIMIT[number]

export interface HomeWidgetsConfig {
  order: HomeWidgetId[]
  enabled: Record<HomeWidgetId, boolean>
  limits: Record<HomeWidgetWithLimit, number>
  collapsed: Record<string, boolean>
}

export const DEFAULT_HOME_WIDGETS_CONFIG: HomeWidgetsConfig = {
  order: [
    'chartStats',
    'createdCalendar',
    'quickActions',
    'inbox',
    'continue',
    'similar',
    'favorites',
    'stats',
    'extendedStats',
    'topViews',
    'markers',
    'health',
    'topTags',
  ],
  enabled: {
    stats: false,
    extendedStats: false,
    chartStats: true,
    createdCalendar: true,
    quickActions: true,
    inbox: true,
    continue: true,
    similar: true,
    favorites: true,
    topViews: false,
    markers: false,
    health: true,
    topTags: false,
  },
  limits: {
    inbox: 12,
    continue: 12,
    similar: 12,
    favorites: 12,
    topViews: 12,
    markers: 8,
    topTags: 10,
  },
  collapsed: {
    extendedStats: false,
  },
}

function cloneDefaultConfig(): HomeWidgetsConfig {
  return {
    order: [...DEFAULT_HOME_WIDGETS_CONFIG.order],
    enabled: { ...DEFAULT_HOME_WIDGETS_CONFIG.enabled },
    limits: { ...DEFAULT_HOME_WIDGETS_CONFIG.limits },
    collapsed: { ...DEFAULT_HOME_WIDGETS_CONFIG.collapsed },
  }
}

export function parseHomeWidgetsConfig(raw: string | HomeWidgetsConfig | null | undefined): HomeWidgetsConfig {
  if (!raw) return cloneDefaultConfig()

  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return mergeHomeWidgetsConfig(parsed)
  } catch {
    return cloneDefaultConfig()
  }
}

export function mergeHomeWidgetsConfig(parsed: Partial<HomeWidgetsConfig> = {}): HomeWidgetsConfig {
  const base = cloneDefaultConfig()
  const known = new Set<string>(HOME_WIDGET_IDS)

  const order = Array.isArray(parsed.order)
    ? parsed.order.filter((id): id is HomeWidgetId => known.has(id))
    : [...base.order]

  for (const id of HOME_WIDGET_IDS) {
    if (!order.includes(id)) order.push(id)
  }

  const enabled = { ...base.enabled }
  if (parsed.enabled && typeof parsed.enabled === 'object') {
    for (const id of HOME_WIDGET_IDS) {
      if (typeof parsed.enabled[id] === 'boolean') {
        enabled[id] = parsed.enabled[id]
      }
    }
  }

  const limits = { ...base.limits }
  if (parsed.limits && typeof parsed.limits === 'object') {
    for (const id of HOME_WIDGETS_WITH_LIMIT) {
      const value = Number(parsed.limits[id])
      if (Number.isFinite(value)) {
        limits[id] = Math.min(Math.max(Math.round(value), 4), 24)
      }
    }
  }

  const collapsed = { ...base.collapsed }
  if (parsed.collapsed && typeof parsed.collapsed === 'object') {
    for (const id of Object.keys(collapsed)) {
      if (typeof parsed.collapsed[id] === 'boolean') {
        collapsed[id] = parsed.collapsed[id]
      }
    }
  }

  return { order, enabled, limits, collapsed }
}

export function serializeHomeWidgetsConfig(config: Partial<HomeWidgetsConfig>): string {
  return JSON.stringify(mergeHomeWidgetsConfig(config))
}

export function setHomeWidgetCollapsed(
  rawConfig: string | HomeWidgetsConfig | null | undefined,
  widgetId: string,
  isCollapsed: boolean,
): string {
  const config = mergeHomeWidgetsConfig(parseHomeWidgetsConfig(rawConfig))
  if (config.collapsed[widgetId] !== undefined) {
    config.collapsed[widgetId] = isCollapsed
  }
  return serializeHomeWidgetsConfig(config)
}
