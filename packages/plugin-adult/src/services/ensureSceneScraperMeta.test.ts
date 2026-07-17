import {describe, expect, it} from 'vitest'
import {getSceneScraperFieldTemplates} from './ensureSceneScraperMeta'
import SceneScraperFields from '../assets/SceneScraperFields'

describe('ensureSceneScraperMeta helpers', () => {
  it('exposes all scene scraper field templates', () => {
    const fields = getSceneScraperFieldTemplates()
    expect(fields.length).toBe((SceneScraperFields as unknown[]).length)
    expect(fields.map((field) => field.key)).toEqual(
      (SceneScraperFields as Array<{key: string}>).map((field) => field.key),
    )
    expect(fields.every((field) => field.type && field.name)).toBe(true)
  })
})
