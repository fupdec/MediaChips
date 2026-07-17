import {describe, expect, it} from 'vitest'
import {
  STASH_PLUGIN_ID,
  activateStashPlugin,
  stashPluginManifest,
} from './plugin'

describe('stash plugin', () => {
  it('exposes a stable manifest id', () => {
    expect(stashPluginManifest.id).toBe(STASH_PLUGIN_ID)
    expect(stashPluginManifest.id).toBe('mediachips.stash')
  })

  it('registers a Database settings panel', () => {
    const panels: Array<{tab: string; componentKey: string}> = []
    activateStashPlugin({
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
      sectionId: 'settings-import-stash',
      componentKey: 'SettingsImportStash',
    }])
  })
})
