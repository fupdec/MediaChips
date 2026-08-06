/**
 * @vitest-environment node
 */
import {describe, expect, it} from 'vitest'
import {resolveProcessResourcesPath} from './resourcesPath'

describe('resolveProcessResourcesPath', () => {
  it('prefers MEDIA_CHIPS_RESOURCES_PATH over process.resourcesPath', () => {
    expect(resolveProcessResourcesPath(
      {MEDIA_CHIPS_RESOURCES_PATH: '/from/env'},
      {resourcesPath: '/from/process'},
    )).toBe('/from/env')
  })

  it('falls back to process.resourcesPath', () => {
    expect(resolveProcessResourcesPath(
      {},
      {resourcesPath: '/from/process'},
    )).toBe('/from/process')
  })

  it('returns undefined when neither is set', () => {
    expect(resolveProcessResourcesPath({}, {})).toBeUndefined()
  })
})
