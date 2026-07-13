import { describe, expect, it } from 'vitest'
import {
  annotateSceneMarkersWithExisting,
  buildSceneMarkerSignature,
} from '@/services/sceneScraperMarkers'
import type { Tag } from '@/types/stores'

const tags: Tag[] = [
  { id: 10, name: 'Missionary', metaId: 1 } as Tag,
]

describe('sceneScraperMarkers', () => {
  it('builds stable marker signatures', () => {
    expect(buildSceneMarkerSignature(120, { tagId: 10 })).toBe('120:tag:10')
    expect(buildSceneMarkerSignature(120, { title: 'Missionary' })).toBe('120:name:missionary')
  })

  it('marks existing meta timeline markers and preselects only new ones', () => {
    const markers = annotateSceneMarkersWithExisting(
      [
        { title: 'Missionary', time: 120, end: null },
        { title: 'Doggy', time: 240, end: null },
      ],
      [{ type: 'meta', time: 120, tagId: 10 }],
      { allTags: tags, markerMetaId: 2 },
    )

    expect(markers).toEqual([
      {
        title: 'Missionary',
        time: 120,
        end: null,
        tagId: 10,
        tagExists: true,
        willCreate: false,
        unresolved: false,
        alreadyExists: true,
        selected: false,
      },
      {
        title: 'Doggy',
        time: 240,
        end: null,
        tagId: null,
        tagExists: false,
        willCreate: true,
        unresolved: false,
        alreadyExists: false,
        selected: true,
      },
    ])
  })

  it('marks unresolved markers when meta category is not configured', () => {
    const markers = annotateSceneMarkersWithExisting(
      [{ title: 'Doggy', time: 240, end: null }],
      [],
      { allTags: tags, markerMetaId: null },
    )

    expect(markers[0]).toMatchObject({
      unresolved: true,
      selected: false,
    })
  })
})
