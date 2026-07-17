/**
 * Framework-agnostic plugin contract for MediaChips.
 * UI-specific contribution helpers live in the renderer registry.
 */

export const BUILTIN_PLUGIN_IDS = {
  adult: 'mediachips.adult',
  stash: 'mediachips.stash',
} as const

export type BuiltinPluginId = (typeof BUILTIN_PLUGIN_IDS)[keyof typeof BUILTIN_PLUGIN_IDS]

export type PluginPermission =
  | 'ui.settings'
  | 'ui.menu'
  | 'ui.dialogs'
  | 'ui.routes'
  | 'api.routes'
  | 'network.external'
  | 'fs.read'
  | 'fs.write'

export type PluginSource = 'bundled' | 'user' | 'planned'

export type PluginInstallState =
  | 'planned'
  | 'installed'
  | 'enabled'
  | 'disabled'
  | 'error'

export interface PluginManifest {
  id: string
  name: string
  version: string
  description?: string
  author?: string
  homepage?: string
  /** mdi icon name without `mdi-` prefix, or asset path later */
  icon?: string
  engines: {
    /** Semver range / minimum app version, e.g. ">=1.0.0" */
    mediachips: string
  }
  /** Hide / gate when adult features are off */
  requiresAdult?: boolean
  permissions: PluginPermission[]
  /**
   * Relative path inside the plugin package for Node/Express registration.
   * Example: `main.cjs` — `register(app, db)` CJS export.
   */
  mainEntry?: string | null
  /**
   * Relative path or host token for UI activation.
   * Official adult uses `host:bundled` (load host adult modules when installed).
   */
  uiEntry?: string | null
}

export interface PluginCatalogEntry {
  manifest: PluginManifest
  source: PluginSource
  state: PluginInstallState
  /** Relative or absolute UI entry; null until loadable */
  uiEntry?: string | null
  /** Relative or absolute Node entry for API routes */
  mainEntry?: string | null
  /** Last activation / load error */
  error?: string | null
  enabled: boolean
}

export interface PluginSettingsNavContribution {
  pluginId: string
  value: string
  icon: string
  labelKey: string
  descKey: string
  docId?: string
}

export interface PluginSettingsPanelContribution {
  pluginId: string
  /** Existing settings tab value, or a new tab registered via settings nav */
  tab: string
  /** Stable section id for deep-links */
  sectionId?: string
  /** Opaque component handle resolved in the renderer */
  componentKey: string
}

export interface PluginDialogContribution {
  pluginId: string
  id: string
  componentKey: string
}

export interface PluginRouteContribution {
  pluginId: string
  /** Opaque route object resolved in the renderer */
  routeKey: string
}

type ContributionWithoutPluginId<T extends {pluginId: string}> =
  Omit<T, 'pluginId'> & Partial<Pick<T, 'pluginId'>>

/** Host API passed to plugin activate(). Framework-agnostic. */
export interface PluginApi {
  settings: {
    addNavItem(item: ContributionWithoutPluginId<PluginSettingsNavContribution>): void
    addPanel(panel: ContributionWithoutPluginId<PluginSettingsPanelContribution>): void
  }
  dialogs: {
    register(dialog: ContributionWithoutPluginId<PluginDialogContribution>): void
  }
  routes: {
    add(route: ContributionWithoutPluginId<PluginRouteContribution>): void
  }
}

export interface MediaChipsPlugin {
  manifest: PluginManifest
  activate(api: PluginApi): void | Promise<void>
  deactivate?(): void | Promise<void>
}
