import {describe, expect, it} from 'vitest'
import {isSfwBuild} from './buildFlags'
import {SFW_COMPILED} from './sfwCompiled'
import {createBundledPluginCatalog} from './plugins/bundledCatalog'

describe('SFW build flags', () => {
  it('keeps SFW_COMPILED false in the source tree by default', () => {
    expect(SFW_COMPILED).toBe(false)
  })

  it('detects MEDIA_CHIPS_SFW=1', () => {
    const previous = process.env.MEDIA_CHIPS_SFW
    process.env.MEDIA_CHIPS_SFW = '1'
    try {
      expect(isSfwBuild()).toBe(true)
      expect(createBundledPluginCatalog()).toEqual([])
    } finally {
      if (previous == null) delete process.env.MEDIA_CHIPS_SFW
      else process.env.MEDIA_CHIPS_SFW = previous
    }
  })

  it('keeps adult catalog when not SFW', () => {
    const previous = process.env.MEDIA_CHIPS_SFW
    delete process.env.MEDIA_CHIPS_SFW
    try {
      expect(isSfwBuild()).toBe(false)
      expect(createBundledPluginCatalog(['mediachips.adult']).length).toBe(1)
    } finally {
      if (previous == null) delete process.env.MEDIA_CHIPS_SFW
      else process.env.MEDIA_CHIPS_SFW = previous
    }
  })
})
