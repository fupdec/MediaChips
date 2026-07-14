import {describe, expect, it, vi} from 'vitest'
import {
  ADULT_COMPONENT_KEYS,
  ADULT_PLUGIN_ID,
  activateAdultPlugin,
  adultPlugin,
  createAdultComponentMap,
} from './index'

describe('@mediachips/plugin-adult', () => {
  it('exposes a stable plugin id and manifest', () => {
    expect(adultPlugin.manifest.id).toBe(ADULT_PLUGIN_ID)
    expect(adultPlugin.manifest.requiresAdult).toBe(true)
  })

  it('registers scraper panel under Plugins and dialogs (no Adult tab)', () => {
    const addNavItem = vi.fn()
    const addPanel = vi.fn()
    const register = vi.fn()

    activateAdultPlugin({
      settings: {addNavItem, addPanel},
      dialogs: {register},
      routes: {add: vi.fn()},
    })

    expect(addNavItem).not.toHaveBeenCalled()
    expect(addPanel).toHaveBeenCalledWith(expect.objectContaining({
      tab: 'plugins',
      componentKey: ADULT_COMPONENT_KEYS.settingsDataScraper,
    }))
    expect(register).toHaveBeenCalledTimes(4)
  })

  it('builds a component map from host loaders', () => {
    const loader = async () => ({default: {}})
    const map = createAdultComponentMap({
      [ADULT_COMPONENT_KEYS.settingsDataScraper]: loader,
      [ADULT_COMPONENT_KEYS.dialogScraper]: loader,
      [ADULT_COMPONENT_KEYS.dialogScraperMultiple]: loader,
      [ADULT_COMPONENT_KEYS.dialogSceneScraper]: loader,
      [ADULT_COMPONENT_KEYS.dialogSceneScraperMultiple]: loader,
    })

    expect(Object.keys(map)).toHaveLength(5)
    expect(map[ADULT_COMPONENT_KEYS.settingsDataScraper]).toBe(loader)
  })
})
