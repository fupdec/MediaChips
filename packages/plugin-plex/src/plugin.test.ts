import {describe, expect, it} from 'vitest'
import {PLEX_PLUGIN_ID, activatePlexPlugin, plexPluginManifest} from './plugin'

describe('plex plugin', () => {
  it('registers its stable settings panel', () => {
    const panels: Array<{tab: string; sectionId: string; componentKey: string}> = []
    activatePlexPlugin({
      settings: {addNavItem() {}, addPanel(panel: {tab: string; sectionId: string; componentKey: string}) { panels.push(panel) }},
      dialogs: {register() {}},
      routes: {add() {}},
    })
    expect(plexPluginManifest.id).toBe(PLEX_PLUGIN_ID)
    expect(PLEX_PLUGIN_ID).toBe('mediachips.plex')
    expect(panels).toEqual([{tab: 'plugins', sectionId: 'settings-import-plex', componentKey: 'SettingsImportPlex'}])
  })
})
