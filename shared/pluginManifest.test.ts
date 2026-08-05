import {describe, expect, it} from 'vitest'
import {
  isSafePluginId,
  parsePluginManifest,
  parseRelativePluginEntry,
} from './pluginManifest'

describe('pluginManifest', () => {
  it('validates plugin ids', () => {
    expect(isSafePluginId('mediachips.example')).toBe(true)
    expect(isSafePluginId('bad')).toBe(false)
    expect(isSafePluginId('mediachips..evil')).toBe(false)
  })

  it('parses relative entries and rejects escapes', () => {
    expect(parseRelativePluginEntry('ui/main.js')).toBe('ui/main.js')
    expect(parseRelativePluginEntry('host:adult')).toBe('host:adult')
    expect(() => parseRelativePluginEntry('../evil.js')).toThrow(/relative path/)
  })

  it('parses a minimal manifest', () => {
    expect(parsePluginManifest({
      id: 'mediachips.demo',
      name: 'Demo',
      version: '1.0.0',
      engines: {mediachips: '>=1'},
      permissions: ['ui.menu', 'nope'],
      mainEntry: './index.js',
    })).toMatchObject({
      id: 'mediachips.demo',
      permissions: ['ui.menu'],
      mainEntry: 'index.js',
    })
  })
})
