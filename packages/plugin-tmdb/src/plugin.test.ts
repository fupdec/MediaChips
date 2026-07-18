import {describe, expect, it} from 'vitest'
import {TMDB_PLUGIN_ID, activateTmdbPlugin, tmdbPluginManifest} from './plugin'

describe('tmdb plugin', () => {
  it('registers settings panel and dialog', () => {
    const panels: Array<{tab: string; sectionId?: string; componentKey: string}> = []
    const dialogs: Array<{id: string; componentKey: string}> = []
    activateTmdbPlugin({
      settings: {addNavItem() {}, addPanel(panel) { panels.push(panel) }},
      dialogs: {register(dialog) { dialogs.push(dialog) }},
      routes: {add() {}},
    })
    expect(tmdbPluginManifest.id).toBe(TMDB_PLUGIN_ID)
    expect(panels[0]?.componentKey).toBe('SettingsTmdb')
    expect(dialogs.map((dialog) => dialog.id)).toEqual(['tmdbScraper', 'tmdbPersonScraper'])
  })
})
