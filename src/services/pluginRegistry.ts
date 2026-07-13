import {createBundledPluginCatalog} from '@shared/plugins'
import type {
  PluginCatalogEntry,
  PluginDialogContribution,
  PluginRouteContribution,
  PluginSettingsNavContribution,
  PluginSettingsPanelContribution,
} from '@shared/plugins'

export interface PluginRegistrySnapshot {
  catalog: PluginCatalogEntry[]
  settingsNav: PluginSettingsNavContribution[]
  settingsPanels: PluginSettingsPanelContribution[]
  dialogs: PluginDialogContribution[]
  routes: PluginRouteContribution[]
}

function cloneCatalog(entries: PluginCatalogEntry[]): PluginCatalogEntry[] {
  return entries.map((entry) => ({
    ...entry,
    manifest: {
      ...entry.manifest,
      permissions: [...entry.manifest.permissions],
      engines: {...entry.manifest.engines},
    },
  }))
}

/**
 * In-memory plugin registry.
 * Catalog is loaded from bundled (or planned) entries; contributions come from activate().
 */
export class PluginRegistry {
  private catalog: PluginCatalogEntry[] = []
  private settingsNav: PluginSettingsNavContribution[] = []
  private settingsPanels: PluginSettingsPanelContribution[] = []
  private dialogs: PluginDialogContribution[] = []
  private routes: PluginRouteContribution[] = []
  private revision = 0

  constructor(initialCatalog: PluginCatalogEntry[] = createBundledPluginCatalog()) {
    this.catalog = cloneCatalog(initialCatalog)
  }

  getRevision(): number {
    return this.revision
  }

  private bump() {
    this.revision += 1
  }

  reset(initialCatalog: PluginCatalogEntry[] = createBundledPluginCatalog()) {
    this.catalog = cloneCatalog(initialCatalog)
    this.settingsNav = []
    this.settingsPanels = []
    this.dialogs = []
    this.routes = []
    this.bump()
  }

  getCatalog(): PluginCatalogEntry[] {
    return cloneCatalog(this.catalog)
  }

  getEntry(pluginId: string): PluginCatalogEntry | undefined {
    const entry = this.catalog.find((item) => item.manifest.id === pluginId)
    return entry ? cloneCatalog([entry])[0] : undefined
  }

  isEnabled(pluginId: string): boolean {
    return Boolean(this.catalog.find((item) => item.manifest.id === pluginId)?.enabled)
  }

  /** Soft enable/disable. Planned plugins stay disabled. */
  setEnabled(pluginId: string, enabled: boolean): PluginCatalogEntry | null {
    const entry = this.catalog.find((item) => item.manifest.id === pluginId)
    if (!entry) return null

    if (entry.state === 'planned' || entry.source === 'planned') {
      entry.enabled = false
      this.bump()
      return cloneCatalog([entry])[0]
    }

    entry.enabled = enabled
    entry.state = enabled ? 'enabled' : 'disabled'
    this.bump()
    return cloneCatalog([entry])[0]
  }

  replaceCatalog(entries: PluginCatalogEntry[]) {
    this.catalog = cloneCatalog(entries)
    this.bump()
  }

  registerSettingsNav(contribution: PluginSettingsNavContribution) {
    this.settingsNav = this.settingsNav
      .filter((item) => !(item.pluginId === contribution.pluginId && item.value === contribution.value))
      .concat(contribution)
    this.bump()
  }

  unregisterSettingsNav(pluginId: string) {
    this.settingsNav = this.settingsNav.filter((item) => item.pluginId !== pluginId)
    this.bump()
  }

  getSettingsNav(): PluginSettingsNavContribution[] {
    return [...this.settingsNav]
  }

  registerSettingsPanel(contribution: PluginSettingsPanelContribution) {
    this.settingsPanels = this.settingsPanels
      .filter((item) => !(
        item.pluginId === contribution.pluginId
        && item.tab === contribution.tab
        && item.componentKey === contribution.componentKey
      ))
      .concat(contribution)
    this.bump()
  }

  unregisterSettingsPanels(pluginId: string) {
    this.settingsPanels = this.settingsPanels.filter((item) => item.pluginId !== pluginId)
    this.bump()
  }

  getSettingsPanels(): PluginSettingsPanelContribution[] {
    return [...this.settingsPanels]
  }

  registerDialog(contribution: PluginDialogContribution) {
    this.dialogs = this.dialogs
      .filter((item) => !(item.pluginId === contribution.pluginId && item.id === contribution.id))
      .concat(contribution)
    this.bump()
  }

  unregisterDialogs(pluginId: string) {
    this.dialogs = this.dialogs.filter((item) => item.pluginId !== pluginId)
    this.bump()
  }

  getDialogs(): PluginDialogContribution[] {
    return [...this.dialogs]
  }

  registerRoute(contribution: PluginRouteContribution) {
    this.routes = this.routes
      .filter((item) => !(item.pluginId === contribution.pluginId && item.routeKey === contribution.routeKey))
      .concat(contribution)
    this.bump()
  }

  unregisterRoutes(pluginId: string) {
    this.routes = this.routes.filter((item) => item.pluginId !== pluginId)
    this.bump()
  }

  clearContributions(pluginId: string) {
    this.unregisterSettingsNav(pluginId)
    this.unregisterSettingsPanels(pluginId)
    this.unregisterDialogs(pluginId)
    this.unregisterRoutes(pluginId)
  }

  snapshot(): PluginRegistrySnapshot {
    return {
      catalog: this.getCatalog(),
      settingsNav: this.getSettingsNav(),
      settingsPanels: this.getSettingsPanels(),
      dialogs: this.getDialogs(),
      routes: [...this.routes],
    }
  }
}

let sharedRegistry: PluginRegistry | null = null

export function getPluginRegistry(): PluginRegistry {
  if (!sharedRegistry) {
    sharedRegistry = new PluginRegistry()
  }
  return sharedRegistry
}

/** Test helper — resets the singleton. */
export function resetPluginRegistryForTests(catalog?: PluginCatalogEntry[]) {
  sharedRegistry = catalog ? new PluginRegistry(catalog) : new PluginRegistry()
  return sharedRegistry
}
