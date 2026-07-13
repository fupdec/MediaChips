import { describe, expect, it } from 'vitest'
import {
  buildExistingMarkSignature,
  buildSceneMarkerSignature,
  findTagForMarkerTitle,
  resolveMarkerTagId,
} from './sceneMarkerTags'

describe('sceneMarkerTags', () => {
  const tags = [
    { id: 5, name: 'Missionary', synonyms: 'Mish', metaId: 1 },
    { id: 6, name: 'Doggy', synonyms: null, metaId: 2 },
  ]

  it('finds tags globally by name or synonym', () => {
    expect(findTagForMarkerTitle('mish', tags as never)?.id).toBe(5)
    expect(findTagForMarkerTitle('Doggy', tags as never)?.id).toBe(6)
  })

  it('resolves existing tags and planned creations', () => {
    expect(resolveMarkerTagId({
      title: 'Missionary',
      allTags: tags as never,
      markerMetaId: 99,
    })).toEqual({
      tagId: 5,
      tagExists: true,
      willCreate: false,
      unresolved: false,
    })

    expect(resolveMarkerTagId({
      title: 'Cowgirl',
      allTags: tags as never,
      markerMetaId: 99,
    })).toEqual({
      tagId: null,
      tagExists: false,
      willCreate: true,
      unresolved: false,
    })

    expect(resolveMarkerTagId({
      title: 'Cowgirl',
      allTags: tags as never,
      markerMetaId: null,
    })).toEqual({
      tagId: null,
      tagExists: false,
      willCreate: false,
      unresolved: true,
    })
  })

  it('builds signatures for meta marks and legacy bookmarks', () => {
    expect(buildSceneMarkerSignature(120, { tagId: 5 })).toBe('120:tag:5')
    expect(buildExistingMarkSignature({ type: 'meta', time: 120, tagId: 5 })).toBe('120:tag:5')
    expect(buildExistingMarkSignature({ type: 'bookmark', time: 120, text: 'Missionary' })).toBe('120:name:missionary')
  })
})
