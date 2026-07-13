import {BUILTIN_PLUGIN_IDS, createBundledPluginCatalog} from '@shared/plugins'
import type {PluginCatalogEntry} from '@shared/plugins'
import {getPluginRegistry} from '@/services/pluginRegistry'
import type {MediaChipsPlugin, PluginApi, PluginComponentMap} from '@/types/pluginRuntime'
import {adultPlugin, adultHostComponentMap} from '@/plugins/adult/hostBridge'

const pluginModules: Record<string, MediaChipsPlugin> = {
  [BUILTIN_PLUGIN_IDS.adult]: adultPlugin,
}

const componentMaps: Record<string, PluginComponentMap> = {
  [BUILTIN_PLUGIN_IDS.adult]: adultHostComponentMap,
}

const activated = new Set<string>()

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

export async function activatePlugin(pluginId: string): Promise<boolean> {
  if (activated.has(pluginId)) return true

  const plugin = pluginModules[pluginId]
  if (!plugin) return false

  const registry = getPluginRegistry()
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
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item)).filter(Boolean)
  }

  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item)).filter(Boolean)
      }
    } catch {
      return raw.split(',').map((item) => item.trim()).filter(Boolean)
    }
  }

  return [BUILTIN_PLUGIN_IDS.adult]
}

export function serializeEnabledPlugins(pluginIds: string[]): string {
  return JSON.stringify(pluginIds)
}

export async function bootstrapPlugins(enabledPluginIds?: string[]): Promise<void> {
  const enabled = enabledPluginIds ?? [BUILTIN_PLUGIN_IDS.adult]
  const registry = getPluginRegistry()
  registry.reset(createBundledPluginCatalog(enabled))

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
