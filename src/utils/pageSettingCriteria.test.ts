import {describe, expect, it} from 'vitest'
import {normalizePageSettingCriteria} from './pageSettingCriteria'

describe('normalizePageSettingCriteria', () => {
  it('converts missing and invalid ids to null', () => {
    expect(normalizePageSettingCriteria({
      mediaTypeId: 3,
    })).toEqual({
      tagId: null,
      mediaTypeId: 3,
      metaId: null,
      tabId: null,
    })
  })

  it('keeps positive ids', () => {
    expect(normalizePageSettingCriteria({
      tagId: 1,
      mediaTypeId: 2,
      metaId: 3,
      tabId: 4,
    })).toEqual({
      tagId: 1,
      mediaTypeId: 2,
      metaId: 3,
      tabId: 4,
    })
  })
})
