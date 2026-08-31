import {describe, expect, it, vi} from 'vitest'
import {nextTick, ref} from 'vue'

vi.mock('@/utils/thumbSource', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/thumbSource')>()
  return {
    ...actual,
    resolveGridSpriteDisplayUrl: vi.fn(() => '/api/get-file?url=grids%2F2.jpg'),
  }
})

vi.mock('@/utils/probeImageUrl', () => ({
  probeDisplayImageUrl: vi.fn(async () => true),
}))

import {probeDisplayImageUrl} from '@/utils/probeImageUrl'
import {mediaGridPosterTileIndex, useStaticGridPoster} from './useStaticGridPoster'

describe('mediaGridPosterTileIndex', () => {
  it('prefers semanticTileIndex then similarity.tileIndex', () => {
    expect(mediaGridPosterTileIndex({semanticTileIndex: 7})).toBe(7)
    expect(mediaGridPosterTileIndex({similarity: {tileIndex: 3}})).toBe(3)
    expect(mediaGridPosterTileIndex({
      semanticTileIndex: 1,
      similarity: {tileIndex: 8},
    })).toBe(1)
    expect(mediaGridPosterTileIndex({semanticTileIndex: 9})).toBeNull()
    expect(mediaGridPosterTileIndex({})).toBeNull()
  })
})

describe('useStaticGridPoster', () => {
  it('loads a grid sprite sheet for a matching tile', async () => {
    const media = ref({id: 2, semanticTileIndex: 7})
    const isMounted = ref(true)
    const {showStaticGridPoster, sheetStyle, tileIndex} = useStaticGridPoster({
      media,
      mediaPath: '/media',
      mediaAspectRatio: 16 / 9,
      previewActive: true,
      isMounted,
    })

    expect(tileIndex.value).toBe(7)
    await vi.waitFor(() => expect(showStaticGridPoster.value).toBe(true))
    expect(sheetStyle.value?.backgroundImage).toContain('grids%2F2.jpg')
    expect(sheetStyle.value).toMatchObject({
      left: '-100%',
      top: '-200%',
    })
    expect(probeDisplayImageUrl).toHaveBeenCalled()
  })

  it('falls back when the grid sprite is missing', async () => {
    vi.mocked(probeDisplayImageUrl).mockResolvedValueOnce(false)
    const {showStaticGridPoster} = useStaticGridPoster({
      media: {id: 2, semanticTileIndex: 4} as never,
      mediaPath: '/media',
      mediaAspectRatio: 16 / 9,
      previewActive: true,
      isMounted: true,
    })

    await nextTick()
    await vi.waitFor(() => expect(showStaticGridPoster.value).toBe(false))
  })
})
