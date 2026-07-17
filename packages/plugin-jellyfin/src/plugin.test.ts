import {describe, expect, it} from 'vitest'
import {
  JELLYFIN_PLUGIN_ID,
  activateJellyfinPlugin,
  jellyfinPluginManifest,
} from './plugin'

describe('jellyfin plugin', () => {
  it('exposes a stable manifest id', () => {
    expect(jellyfinPluginManifest.id).toBe(JELLYFIN_PLUGIN_ID)
    expect(jellyfinPluginManifest.id).toBe('mediachips.jellyfin')
  })

  it('registers a Plugins settings panel', () => {
    const panels: Array<{tab: string; componentKey: string; sectionId?: string}> = []
    activateJellyfinPlugin({
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
      sectionId: 'settings-import-jellyfin',
      componentKey: 'SettingsImportJellyfin',
    }])
  })
})
