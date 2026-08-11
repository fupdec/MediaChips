import {describe, expect, it} from 'vitest'
import {
  findMetaForSceneField,
  getSceneScraperFieldTemplates,
} from './ensureSceneScraperMeta'
import SceneScraperFields from '../assets/SceneScraperFields'
import type {Meta} from '@/types/stores'

describe('ensureSceneScraperMeta helpers', () => {
  const t = (key: string, fallback?: string) => {
    const map: Record<string, string> = {
      'scene_scraper.fields.release_date': 'Дата релиза',
      'scene_scraper.fields.studio': 'Студия',
      'scene_scraper.fields.performers': 'Исполнители',
      'scene_scraper.fields.tags': 'Теги',
    }
    return map[key] || fallback || key
  }

  it('exposes all scene scraper field templates', () => {
    const fields = getSceneScraperFieldTemplates()
    expect(fields.length).toBe((SceneScraperFields as unknown[]).length)
    expect(fields.map((field) => field.key)).toEqual(
      (SceneScraperFields as Array<{key: string}>).map((field) => field.key),
    )
    expect(fields.every((field) => field.type && field.name)).toBe(true)
  })

  it('reuses common pinned library names via aliases', () => {
    const metas = [
      {id: 1, name: 'Tags', type: 'array'} as Meta,
      {id: 2, name: 'Girls', type: 'array', scraper: true} as Meta,
      {id: 3, name: 'Websites', type: 'array'} as Meta,
      {id: 4, name: 'Release', type: 'date'} as Meta,
      {id: 5, name: 'Cum', type: 'array'} as Meta,
    ]

    expect(findMetaForSceneField(metas, {key: 'tags', name: 'Tags', type: 'array'}, t, {
      preferMetaIds: [1, 2, 3, 4],
    })?.id).toBe(1)

    expect(findMetaForSceneField(metas, {key: 'performers', name: 'Performers', type: 'array'}, t, {
      preferMetaIds: [1, 2, 3, 4],
    })?.id).toBe(2)

    expect(findMetaForSceneField(metas, {key: 'studio', name: 'Studio', type: 'array'}, t, {
      preferMetaIds: [1, 2, 3, 4],
    })?.id).toBe(3)

    expect(findMetaForSceneField(metas, {key: 'release_date', name: 'Release date', type: 'date'}, t, {
      preferMetaIds: [1, 2, 3, 4],
    })?.id).toBe(4)
  })

  it('does not reuse a meta already claimed by another scraper slot', () => {
    const metas = [
      {id: 1, name: 'Tags', type: 'array'} as Meta,
      {id: 2, name: 'Girls', type: 'array'} as Meta,
    ]

    expect(findMetaForSceneField(metas, {key: 'tags', name: 'Tags', type: 'array'}, t, {
      preferMetaIds: [1, 2],
      excludeMetaIds: [1],
    })).toBeUndefined()

    expect(findMetaForSceneField(metas, {key: 'performers', name: 'Performers', type: 'array'}, t, {
      preferMetaIds: [1, 2],
      excludeMetaIds: [1],
    })?.id).toBe(2)
  })
})
