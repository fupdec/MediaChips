import {describe, expect, it} from 'vitest'
import {isSfwBuild, isStoreBuild, isMsStoreBuild} from './buildFlags'
import {SFW_COMPILED} from './sfwCompiled'
import {MSSTORE_COMPILED} from './msStoreCompiled'
import {createBundledPluginCatalog} from './plugins/bundledCatalog'

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
      expect(createBundledPluginCatalog()).toEqual([])
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
      expect(createBundledPluginCatalog(['mediachips.adult']).length).toBe(1)
    } finally {
      if (previousSfw == null) delete process.env.MEDIA_CHIPS_SFW
      else process.env.MEDIA_CHIPS_SFW = previousSfw
      if (previousMs == null) delete process.env.MEDIA_CHIPS_MSSTORE
      else process.env.MEDIA_CHIPS_MSSTORE = previousMs
    }
  })
})
