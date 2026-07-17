import {BUILTIN_PLUGIN_IDS, createBundledPluginCatalog} from '@shared/plugins'
import type {PluginCatalogEntry} from '@shared/plugins'
import {getPluginRegistry} from '@/services/pluginRegistry'
import type {MediaChipsPlugin, PluginApi, PluginComponentMap} from '@/types/pluginRuntime'
import {adultPlugin, adultHostComponentMap} from '@/plugins/adult/hostBridge'
import {stashPlugin, stashHostComponentMap} from '@/plugins/stash/hostBridge'
import {jellyfinPlugin, jellyfinHostComponentMap} from '@/plugins/jellyfin/hostBridge'
import {plexPlugin, plexHostComponentMap} from '@/plugins/plex/hostBridge'
import {embyPlugin, embyHostComponentMap} from '@/plugins/emby/hostBridge'
import {isSfwBuild} from '@/utils/sfwBuild'
import {apiClient} from '@/services/apiClient'

const DEFAULT_ENABLED_PLUGINS = [
  BUILTIN_PLUGIN_IDS.adult,
  BUILTIN_PLUGIN_IDS.stash,
  BUILTIN_PLUGIN_IDS.jellyfin,
  BUILTIN_PLUGIN_IDS.plex,
  BUILTIN_PLUGIN_IDS.emby,
]

const pluginModules: Record<string, MediaChipsPlugin> = isSfwBuild()
  ? {}
  : {
    [BUILTIN_PLUGIN_IDS.adult]: adultPlugin,
    [BUILTIN_PLUGIN_IDS.stash]: stashPlugin,
    [BUILTIN_PLUGIN_IDS.jellyfin]: jellyfinPlugin,
    [BUILTIN_PLUGIN_IDS.plex]: plexPlugin,
    [BUILTIN_PLUGIN_IDS.emby]: embyPlugin,
  }

const componentMaps: Record<string, PluginComponentMap> = isSfwBuild()
  ? {}
  : {
    [BUILTIN_PLUGIN_IDS.adult]: adultHostComponentMap,
    [BUILTIN_PLUGIN_IDS.stash]: stashHostComponentMap,
    [BUILTIN_PLUGIN_IDS.jellyfin]: jellyfinHostComponentMap,
    [BUILTIN_PLUGIN_IDS.plex]: plexHostComponentMap,
    [BUILTIN_PLUGIN_IDS.emby]: embyHostComponentMap,
  }

const activated = new Set<string>()

const HOST_BUNDLED_IDS = new Set<string>([
  BUILTIN_PLUGIN_IDS.adult,
  BUILTIN_PLUGIN_IDS.stash,
  BUILTIN_PLUGIN_IDS.jellyfin,
  BUILTIN_PLUGIN_IDS.plex,
  BUILTIN_PLUGIN_IDS.emby,
])

function createPluginApi(pluginId: string): PluginApi {
  const registry = getPluginRegistry()

  return {
    settings: {
      addNavItem(item) {
        registry.registerSettingsNav({
          pluginId,
          value: item.value,
          icon: item.icon,
          labelKey: item.labelKey,
          descKey: item.descKey,
          docId: item.docId,
        })
      },
      addPanel(panel) {
        registry.registerSettingsPanel({
          pluginId,
          tab: panel.tab,
          sectionId: panel.sectionId,
          componentKey: panel.componentKey,
        })
      },
    },
    dialogs: {
      register(dialog) {
        registry.registerDialog({
          pluginId,
          id: dialog.id,
          componentKey: dialog.componentKey,
        })
      },
    },
    routes: {
      add(route) {
        registry.registerRoute({
          pluginId,
          routeKey: route.routeKey,
        })
      },
    },
  }
}

export function getPluginComponentLoader(pluginId: string, componentKey: string) {
  return componentMaps[pluginId]?.[componentKey] || null
}

export function resolvePluginComponentLoader(componentKey: string) {
  for (const map of Object.values(componentMaps)) {
    if (map[componentKey]) return map[componentKey]
  }
  return null
}

function isHostBundledUiEntry(entry: PluginCatalogEntry | undefined): boolean {
  if (!entry) return false
  return entry.uiEntry === 'host:bundled'
    || entry.manifest.uiEntry === 'host:bundled'
    || (HOST_BUNDLED_IDS.has(entry.manifest.id) && entry.source === 'user')
}

function bindHostBundledModules(pluginId: string): boolean {
  if (pluginId === BUILTIN_PLUGIN_IDS.adult) {
    if (!pluginModules[pluginId]) pluginModules[pluginId] = adultPlugin
    if (!componentMaps[pluginId]) componentMaps[pluginId] = adultHostComponentMap
    return true
  }
  if (pluginId === BUILTIN_PLUGIN_IDS.stash) {
    if (!pluginModules[pluginId]) pluginModules[pluginId] = stashPlugin
    if (!componentMaps[pluginId]) componentMaps[pluginId] = stashHostComponentMap
    return true
  }
  if (pluginId === BUILTIN_PLUGIN_IDS.jellyfin) {
    if (!pluginModules[pluginId]) pluginModules[pluginId] = jellyfinPlugin
    if (!componentMaps[pluginId]) componentMaps[pluginId] = jellyfinHostComponentMap
    return true
  }
  if (pluginId === BUILTIN_PLUGIN_IDS.plex) {
    if (!pluginModules[pluginId]) pluginModules[pluginId] = plexPlugin
    if (!componentMaps[pluginId]) componentMaps[pluginId] = plexHostComponentMap
    return true
  }
  if (pluginId === BUILTIN_PLUGIN_IDS.emby) {
    if (!pluginModules[pluginId]) pluginModules[pluginId] = embyPlugin
    if (!componentMaps[pluginId]) componentMaps[pluginId] = embyHostComponentMap
    return true
  }
  return false
}

export async function activatePlugin(pluginId: string): Promise<boolean> {
  if (activated.has(pluginId)) return true

  const registry = getPluginRegistry()
  let plugin = pluginModules[pluginId]
  if (!plugin) {
    const entry = registry.getEntry(pluginId)
    if (entry?.source === 'user' && entry.state !== 'error' && isHostBundledUiEntry(entry)) {
      bindHostBundledModules(pluginId)
      plugin = pluginModules[pluginId]
    } else if (entry?.source === 'user' && entry.state !== 'error') {
      registry.setEnabled(pluginId, true)
      return true
    } else {
      return false
    }
  }

  if (!plugin) return false

  try {
    await plugin.activate(createPluginApi(pluginId))
    activated.add(pluginId)
    registry.setEnabled(pluginId, true)
    return true
  } catch (error) {
    console.error(`Failed to activate plugin ${pluginId}`, error)
    const entry = registry.getEntry(pluginId)
    if (entry) {
      registry.replaceCatalog(
        registry.getCatalog().map((item) => (
          item.manifest.id === pluginId
            ? {...item, state: 'error', error: error instanceof Error ? error.message : String(error), enabled: false}
            : item
        )),
      )
    }
    return false
  }
}

export async function deactivatePlugin(pluginId: string): Promise<void> {
  const plugin = pluginModules[pluginId]
  const registry = getPluginRegistry()

  if (plugin?.deactivate) {
    try {
      await plugin.deactivate()
    } catch (error) {
      console.error(`Failed to deactivate plugin ${pluginId}`, error)
    }
  }

  registry.clearContributions(pluginId)
  registry.setEnabled(pluginId, false)
  activated.delete(pluginId)
}

export function parseEnabledPlugins(raw: unknown): string[] {
  let ids: string[] = []

  if (Array.isArray(raw)) {
    ids = raw.map((item) => String(item)).filter(Boolean)
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        ids = parsed.map((item) => String(item)).filter(Boolean)
      } else {
        ids = raw.split(',').map((item) => String(item).trim()).filter(Boolean)
      }
    } catch {
      ids = raw.split(',').map((item) => String(item).trim()).filter(Boolean)
    }
  } else if (!isSfwBuild()) {
    ids = [...DEFAULT_ENABLED_PLUGINS]
  }

  // Soft-migrate previous defaults so new import plugins stay available.
  if (
    !isSfwBuild()
    && (
      (ids.length === 1 && ids[0] === BUILTIN_PLUGIN_IDS.adult)
      || (
        ids.length === 2
        && ids.includes(BUILTIN_PLUGIN_IDS.adult)
        && ids.includes(BUILTIN_PLUGIN_IDS.stash)
      )
    )
  ) {
    ids = [...DEFAULT_ENABLED_PLUGINS]
  }

  return ids
}

export function serializeEnabledPlugins(pluginIds: string[]): string {
  return JSON.stringify(pluginIds)
}

async function fetchUserPluginCatalog(enabledPluginIds: string[]): Promise<PluginCatalogEntry[]> {
  try {
    const {data} = await apiClient.get<PluginCatalogEntry[]>('/api/Plugin', {
      params: {enabledPlugins: JSON.stringify(enabledPluginIds)},
    })
    return Array.isArray(data) ? data : []
  } catch (error) {
    console.warn('Failed to load installed user plugins', error)
    return []
  }
}

export function mergePluginCatalog(
  enabledPluginIds: string[],
  userEntries: PluginCatalogEntry[] = [],
): PluginCatalogEntry[] {
  const bundled = createBundledPluginCatalog(enabledPluginIds)
  const bundledIds = new Set(bundled.map((entry) => entry.manifest.id))
  const users = userEntries
    .filter((entry) => !bundledIds.has(entry.manifest.id))
    .map((entry) => {
      const enabled = enabledPluginIds.includes(entry.manifest.id) && entry.state !== 'error'
      return {
        ...entry,
        enabled,
        state: entry.state === 'error'
          ? 'error' as const
          : (enabled ? 'enabled' as const : 'installed' as const),
      }
    })
  return [...bundled, ...users]
}

export async function bootstrapPlugins(enabledPluginIds?: string[]): Promise<void> {
  const enabled = enabledPluginIds
    ?? (isSfwBuild() ? [] : [...DEFAULT_ENABLED_PLUGINS])
  const registry = getPluginRegistry()
  const userEntries = await fetchUserPluginCatalog(enabled)
  registry.reset(mergePluginCatalog(enabled, userEntries))

  for (const id of activated) {
    registry.clearContributions(id)
  }
  activated.clear()

  for (const pluginId of enabled) {
    await activatePlugin(pluginId)
  }
}

export function listRegisteredPluginModules(): string[] {
  return Object.keys(pluginModules)
}

export function getActivatedPluginIds(): string[] {
  return [...activated]
}

/** Test helper — clears activation tracking (pair with resetPluginRegistryForTests). */
export function resetPluginHostForTests() {
  activated.clear()
}

export type {PluginCatalogEntry}
