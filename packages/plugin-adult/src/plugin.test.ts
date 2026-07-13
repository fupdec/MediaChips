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

  it('registers adult settings tab, panel, and dialogs', () => {
    const addNavItem = vi.fn()
    const addPanel = vi.fn()
    const register = vi.fn()

    activateAdultPlugin({
      settings: {addNavItem, addPanel},
      dialogs: {register},
      routes: {add: vi.fn()},
    })

    expect(addNavItem).toHaveBeenCalledWith(expect.objectContaining({value: 'adult'}))
    expect(addPanel).toHaveBeenCalledWith(expect.objectContaining({
      tab: 'adult',
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
