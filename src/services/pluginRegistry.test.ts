import {describe, expect, it, beforeEach} from 'vitest'
import {
  BUILTIN_PLUGIN_IDS,
  createBundledPluginCatalog,
  createPlannedPluginCatalog,
  createPluginCatalog,
} from '@shared/plugins'
import type {PluginPermission} from '@shared/plugins'
import {
  PluginRegistry,
  getPluginRegistry,
  resetPluginRegistryForTests,
} from '@/services/pluginRegistry'
import {
  activatePlugin,
  bootstrapPlugins,
  deactivatePlugin,
  getActivatedPluginIds,
  parseEnabledPlugins,
  resetPluginHostForTests,
} from '@/services/pluginHost'

describe('pluginRegistry', () => {
  beforeEach(() => {
    resetPluginHostForTests()
    resetPluginRegistryForTests()
  })

  it('starts with bundled adult, stash, and media-server import catalog entries enabled by default', () => {
    const catalog = createBundledPluginCatalog()
    expect(catalog).toHaveLength(6)
    expect(catalog.map((entry) => entry.manifest.id)).toEqual([
      BUILTIN_PLUGIN_IDS.adult,
      BUILTIN_PLUGIN_IDS.stash,
      BUILTIN_PLUGIN_IDS.jellyfin,
      BUILTIN_PLUGIN_IDS.plex,
      BUILTIN_PLUGIN_IDS.emby,
      BUILTIN_PLUGIN_IDS.tmdb,
    ])
    expect(catalog[0]?.source).toBe('bundled')
    expect(catalog.every((entry) => entry.enabled)).toBe(true)
  })

  it('does not enable planned plugins', () => {
    const plannedEntry = {
      manifest: {
        id: 'mediachips.example',
        name: 'Example',
        version: '0.0.0',
        description: 'Test planned plugin',
        author: 'MediaChips',
        icon: 'puzzle',
        engines: {mediachips: '>=1.0.0'},
        requiresAdult: false,
        permissions: ['ui.settings'] as PluginPermission[],
      },
      source: 'planned' as const,
      state: 'planned' as const,
      uiEntry: null,
      mainEntry: null,
      error: null,
      enabled: false,
    }
    const planned = createPlannedPluginCatalog()
    expect(planned).toEqual([])
    const registry = new PluginRegistry([plannedEntry])
    const updated = registry.setEnabled(plannedEntry.manifest.id, true)
    expect(updated?.enabled).toBe(false)
    expect(updated?.state).toBe('planned')
  })

  it('createPluginCatalog returns only bundled plugins', () => {
    const catalog = createPluginCatalog([BUILTIN_PLUGIN_IDS.adult])
    expect(catalog.some((entry) => entry.manifest.id === BUILTIN_PLUGIN_IDS.adult && entry.source === 'bundled')).toBe(true)
    expect(catalog.every((entry) => entry.state !== 'planned')).toBe(true)
    expect(catalog.filter((entry) => entry.manifest.id === BUILTIN_PLUGIN_IDS.adult)).toHaveLength(1)
  })

  it('mergePluginCatalog appends user plugins', async () => {
    const {mergePluginCatalog} = await import('@/services/pluginHost')
    const catalog = mergePluginCatalog([BUILTIN_PLUGIN_IDS.adult], [{
      manifest: {
        id: 'mediachips.demo',
        name: 'Demo',
        version: '1.0.0',
        engines: {mediachips: '>=1.0.0'},
        permissions: ['ui.settings'],
      },
      source: 'user',
      state: 'installed',
      uiEntry: null,
      mainEntry: null,
      error: null,
      enabled: false,
    }])
    expect(catalog.map((entry) => entry.manifest.id)).toEqual([
      BUILTIN_PLUGIN_IDS.adult,
      BUILTIN_PLUGIN_IDS.stash,
      BUILTIN_PLUGIN_IDS.jellyfin,
      BUILTIN_PLUGIN_IDS.plex,
      BUILTIN_PLUGIN_IDS.emby,
      BUILTIN_PLUGIN_IDS.tmdb,
      'mediachips.demo',
    ])
  })

  it('enables and disables bundled plugins', () => {
    const registry = new PluginRegistry(createBundledPluginCatalog([BUILTIN_PLUGIN_IDS.adult]))
    expect(registry.setEnabled(BUILTIN_PLUGIN_IDS.adult, false)?.state).toBe('disabled')
    expect(registry.setEnabled(BUILTIN_PLUGIN_IDS.adult, true)?.state).toBe('enabled')
  })

  it('registers and clears contributions by plugin id', () => {
    const registry = new PluginRegistry()
    registry.registerSettingsNav({
      pluginId: BUILTIN_PLUGIN_IDS.adult,
      value: 'adult',
      icon: 'mdi-shield-alert',
      labelKey: 'settings.tabs.adult',
      descKey: 'settings.tabs_desc.adult',
    })
    registry.registerDialog({
      pluginId: BUILTIN_PLUGIN_IDS.adult,
      id: 'scraper',
      componentKey: 'DialogScraper',
    })

    expect(registry.snapshot().settingsNav).toHaveLength(1)
    expect(registry.snapshot().dialogs).toHaveLength(1)

    registry.clearContributions(BUILTIN_PLUGIN_IDS.adult)
    expect(registry.snapshot().settingsNav).toHaveLength(0)
    expect(registry.snapshot().dialogs).toHaveLength(0)
  })
})

describe('pluginHost', () => {
  beforeEach(() => {
    resetPluginHostForTests()
    resetPluginRegistryForTests(createBundledPluginCatalog([]))
  })

  it('parses enabledPlugins setting values', () => {
    expect(parseEnabledPlugins('["mediachips.adult"]')).toEqual([
      BUILTIN_PLUGIN_IDS.adult,
      BUILTIN_PLUGIN_IDS.stash,
      BUILTIN_PLUGIN_IDS.jellyfin,
      BUILTIN_PLUGIN_IDS.plex,
      BUILTIN_PLUGIN_IDS.emby,
      BUILTIN_PLUGIN_IDS.tmdb,
    ])
    expect(parseEnabledPlugins('["mediachips.adult","mediachips.stash"]')).toEqual([
      BUILTIN_PLUGIN_IDS.adult,
      BUILTIN_PLUGIN_IDS.stash,
      BUILTIN_PLUGIN_IDS.jellyfin,
      BUILTIN_PLUGIN_IDS.plex,
      BUILTIN_PLUGIN_IDS.emby,
      BUILTIN_PLUGIN_IDS.tmdb,
    ])
    expect(parseEnabledPlugins([])).toEqual([])
    expect(parseEnabledPlugins(undefined)).toEqual([
      BUILTIN_PLUGIN_IDS.adult,
      BUILTIN_PLUGIN_IDS.stash,
      BUILTIN_PLUGIN_IDS.jellyfin,
      BUILTIN_PLUGIN_IDS.plex,
      BUILTIN_PLUGIN_IDS.emby,
      BUILTIN_PLUGIN_IDS.tmdb,
    ])
  })

  it('activates stash plugin settings panel', async () => {
    const ok = await activatePlugin(BUILTIN_PLUGIN_IDS.stash)
    expect(ok).toBe(true)
    expect(getActivatedPluginIds()).toContain(BUILTIN_PLUGIN_IDS.stash)

    const live = getPluginRegistry().snapshot()
    expect(live.settingsPanels.some((item) =>
      item.componentKey === 'SettingsImportStash' && item.tab === 'plugins',
    )).toBe(true)
  })

  it('activates adult plugin contributions', async () => {
    const ok = await activatePlugin(BUILTIN_PLUGIN_IDS.adult)
    expect(ok).toBe(true)
    expect(getActivatedPluginIds()).toContain(BUILTIN_PLUGIN_IDS.adult)

    const live = getPluginRegistry().snapshot()
    expect(live.settingsNav.some((item) => item.value === 'adult')).toBe(false)
    expect(live.settingsPanels.some((item) =>
      item.componentKey === 'SettingsDataScraper' && item.tab === 'plugins',
    )).toBe(true)
    expect(live.dialogs.length).toBeGreaterThanOrEqual(4)
  })

  it('bootstraps enabled plugins and can deactivate', async () => {
    await bootstrapPlugins([BUILTIN_PLUGIN_IDS.adult])
    expect(getActivatedPluginIds()).toContain(BUILTIN_PLUGIN_IDS.adult)

    await deactivatePlugin(BUILTIN_PLUGIN_IDS.adult)
    expect(getActivatedPluginIds()).not.toContain(BUILTIN_PLUGIN_IDS.adult)
    expect(getPluginRegistry().snapshot().settingsNav).toHaveLength(0)
  })
})
