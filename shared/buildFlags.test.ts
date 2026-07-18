import {describe, expect, it} from 'vitest'
import {isSfwBuild, isStoreBuild, isMsStoreBuild} from './buildFlags'
import {SFW_COMPILED} from './sfwCompiled'
import {MSSTORE_COMPILED} from './msStoreCompiled'
import {createBundledPluginCatalog} from './plugins/bundledCatalog'
import {BUILTIN_PLUGIN_IDS} from './plugins/types'

describe('build channel flags', () => {
  it('keeps compiled flags false in the source tree by default', () => {
    expect(SFW_COMPILED).toBe(false)
    expect(MSSTORE_COMPILED).toBe(false)
  })

  it('treats MEDIA_CHIPS_SFW=1 as adult-strip channel without license bypass', () => {
    const previousSfw = process.env.MEDIA_CHIPS_SFW
    const previousMs = process.env.MEDIA_CHIPS_MSSTORE
    process.env.MEDIA_CHIPS_SFW = '1'
    delete process.env.MEDIA_CHIPS_MSSTORE
    try {
      expect(isSfwBuild()).toBe(true)
      expect(isStoreBuild()).toBe(true)
      expect(isMsStoreBuild()).toBe(false)
      const catalog = createBundledPluginCatalog()
      expect(catalog).toHaveLength(1)
      expect(catalog[0]?.manifest.id).toBe(BUILTIN_PLUGIN_IDS.tmdb)
      expect(catalog.some((entry) => entry.manifest.id === BUILTIN_PLUGIN_IDS.adult)).toBe(false)
    } finally {
      if (previousSfw == null) delete process.env.MEDIA_CHIPS_SFW
      else process.env.MEDIA_CHIPS_SFW = previousSfw
      if (previousMs == null) delete process.env.MEDIA_CHIPS_MSSTORE
      else process.env.MEDIA_CHIPS_MSSTORE = previousMs
    }
  })

  it('treats MEDIA_CHIPS_MSSTORE=1 as license bypass channel', () => {
    const previous = process.env.MEDIA_CHIPS_MSSTORE
    process.env.MEDIA_CHIPS_MSSTORE = '1'
    try {
      expect(isMsStoreBuild()).toBe(true)
    } finally {
      if (previous == null) delete process.env.MEDIA_CHIPS_MSSTORE
      else process.env.MEDIA_CHIPS_MSSTORE = previous
    }
  })

  it('keeps adult catalog on the standard channel', () => {
    const previousSfw = process.env.MEDIA_CHIPS_SFW
    const previousMs = process.env.MEDIA_CHIPS_MSSTORE
    delete process.env.MEDIA_CHIPS_SFW
    delete process.env.MEDIA_CHIPS_MSSTORE
    try {
      expect(isSfwBuild()).toBe(false)
      expect(isStoreBuild()).toBe(false)
      expect(isMsStoreBuild()).toBe(false)
      const catalog = createBundledPluginCatalog([BUILTIN_PLUGIN_IDS.adult])
      expect(catalog).toHaveLength(6)
      expect(catalog.map((entry) => entry.manifest.id)).toEqual([
        BUILTIN_PLUGIN_IDS.adult,
        BUILTIN_PLUGIN_IDS.stash,
        BUILTIN_PLUGIN_IDS.jellyfin,
        BUILTIN_PLUGIN_IDS.plex,
        BUILTIN_PLUGIN_IDS.emby,
        BUILTIN_PLUGIN_IDS.tmdb,
      ])
      expect(catalog.filter((entry) => entry.enabled).map((entry) => entry.manifest.id)).toEqual([
        BUILTIN_PLUGIN_IDS.adult,
      ])
      expect(
        createBundledPluginCatalog([BUILTIN_PLUGIN_IDS.adult, BUILTIN_PLUGIN_IDS.stash]).filter(
          (entry) => entry.enabled,
        ).length,
      ).toBe(2)
    } finally {
      if (previousSfw == null) delete process.env.MEDIA_CHIPS_SFW
      else process.env.MEDIA_CHIPS_SFW = previousSfw
      if (previousMs == null) delete process.env.MEDIA_CHIPS_MSSTORE
      else process.env.MEDIA_CHIPS_MSSTORE = previousMs
    }
  })
})
