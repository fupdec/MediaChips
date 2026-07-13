import {describe, expect, it, beforeEach} from 'vitest'
import {
  BUILTIN_PLUGIN_IDS,
  createBundledPluginCatalog,
  createPlannedPluginCatalog,
} from '@shared/plugins'
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

  it('starts with bundled adult catalog entry enabled by default', () => {
    const catalog = createBundledPluginCatalog()
    expect(catalog).toHaveLength(1)
    expect(catalog[0]?.manifest.id).toBe(BUILTIN_PLUGIN_IDS.adult)
    expect(catalog[0]?.source).toBe('bundled')
    expect(catalog[0]?.enabled).toBe(true)
  })

  it('does not enable planned plugins', () => {
    const registry = new PluginRegistry(createPlannedPluginCatalog())
    const updated = registry.setEnabled(BUILTIN_PLUGIN_IDS.adult, true)
    expect(updated?.enabled).toBe(false)
    expect(updated?.state).toBe('planned')
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
    expect(parseEnabledPlugins('["mediachips.adult"]')).toEqual([BUILTIN_PLUGIN_IDS.adult])
    expect(parseEnabledPlugins([])).toEqual([])
    expect(parseEnabledPlugins(undefined)).toEqual([BUILTIN_PLUGIN_IDS.adult])
  })

  it('activates adult plugin contributions', async () => {
    const ok = await activatePlugin(BUILTIN_PLUGIN_IDS.adult)
    expect(ok).toBe(true)
    expect(getActivatedPluginIds()).toContain(BUILTIN_PLUGIN_IDS.adult)

    const live = getPluginRegistry().snapshot()
    expect(live.settingsNav.some((item) => item.value === 'adult')).toBe(true)
    expect(live.settingsPanels.some((item) => item.componentKey === 'SettingsDataScraper')).toBe(true)
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
