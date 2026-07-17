import {describe, expect, it} from 'vitest'
import {
  EMBY_PLUGIN_ID,
  activateEmbyPlugin,
  embyPluginManifest,
} from './plugin'

describe('emby plugin', () => {
  it('exposes a stable manifest id', () => {
    expect(embyPluginManifest.id).toBe(EMBY_PLUGIN_ID)
    expect(embyPluginManifest.id).toBe('mediachips.emby')
  })

  it('registers a Plugins settings panel', () => {
    const panels: Array<{tab: string; componentKey: string; sectionId?: string}> = []
    activateEmbyPlugin({
      settings: {
        addNavItem() {},
        addPanel(panel) {
          panels.push(panel)
        },
      },
      dialogs: {register() {}},
      routes: {add() {}},
    })

    expect(panels).toEqual([{
      tab: 'plugins',
      sectionId: 'settings-import-emby',
      componentKey: 'SettingsImportEmby',
    }])
  })
})
