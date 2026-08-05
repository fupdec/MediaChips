import {describe, expect, it} from 'vitest'
import {
  buildExistingMarkSignature,
  buildSceneMarkerSignature,
  findTagForMarkerTitle,
  resolveMarkerTagId,
} from './sceneMarkerTags'

describe('sceneMarkerTags', () => {
  const tags = [
    {id: 5, name: 'Missionary', synonyms: 'Mish'},
    {id: 6, name: 'Doggy', synonyms: null},
  ]

  it('finds tags and resolves create/unresolved states', () => {
    expect(findTagForMarkerTitle('mish', tags)?.id).toBe(5)
    expect(resolveMarkerTagId({
      title: 'Cowgirl',
      allTags: tags,
      markerMetaId: 99,
    })).toMatchObject({willCreate: true, unresolved: false})
    expect(resolveMarkerTagId({
      title: 'Cowgirl',
      allTags: tags,
      markerMetaId: null,
    })).toMatchObject({unresolved: true})
  })

  it('builds mark signatures', () => {
    expect(buildSceneMarkerSignature(120, {tagId: 5})).toBe('120:tag:5')
    expect(buildExistingMarkSignature({type: 'bookmark', time: 120, text: 'Missionary'}))
      .toBe('120:name:missionary')
  })
})
