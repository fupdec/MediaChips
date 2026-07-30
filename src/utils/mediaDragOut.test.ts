import { describe, expect, it } from 'vitest'
import { collectMediaDragPaths } from './mediaDragOut'
import type { MediaItem } from '@shared/entities/media'

function media(id: number, path?: string): MediaItem {
  return { id, path } as MediaItem
}

describe('collectMediaDragPaths', () => {
  it('returns the card path when nothing is selected', () => {
    expect(collectMediaDragPaths(media(1, '/a.mp4'), [], {})).toEqual(['/a.mp4'])
  })

  it('returns empty when the card has no path', () => {
    expect(collectMediaDragPaths(media(1), [1], {})).toEqual([])
  })

  it('returns only the card when it is not in the selection', () => {
    expect(collectMediaDragPaths(
      media(1, '/a.mp4'),
      [2, 3],
      { entities: [media(2, '/b.mp4'), media(3, '/c.mp4')] },
    )).toEqual(['/a.mp4'])
  })

  it('returns all selected media paths when the card is selected', () => {
    expect(collectMediaDragPaths(
      media(2, '/b.mp4'),
      [1, 2, 3],
      {
        getItemById: (id) => ({
          1: media(1, '/a.mp4'),
          2: media(2, '/b.mp4'),
          3: media(3, '/c.mp4'),
        }[id]),
      },
    )).toEqual(['/a.mp4', '/b.mp4', '/c.mp4'])
  })

  it('skips selected items without paths and dedupes', () => {
    expect(collectMediaDragPaths(
      media(1, '/a.mp4'),
      [1, 2, 3],
      {
        entities: [
          media(1, '/a.mp4'),
          media(2),
          media(3, '/a.mp4'),
        ],
      },
    )).toEqual(['/a.mp4'])
  })
})
