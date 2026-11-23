import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createApp, nextTick, ref} from 'vue'

vi.mock('@/utils/thumbSource', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/thumbSource')>()
  return {
    ...actual,
    resolveGridSpriteDisplayUrl: vi.fn((_path: string, id: number) => `/api/get-file?url=grids%2F${id}.jpg`),
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

const cleanups: Array<() => void> = []
beforeEach(() => vi.clearAllMocks())
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()))

function setup() {
  const media = ref({id: 2, semanticTileIndex: 7})
  const previewActive = ref(true)
  const isMounted = ref(true)
  let poster!: ReturnType<typeof useStaticGridPoster>
  const app = createApp({setup() {
    poster = useStaticGridPoster({media, mediaPath: '/media', mediaAspectRatio: 16 / 9, previewActive, isMounted})
    return () => null
  }})
  app.mount(document.createElement('div'))
  cleanups.push(() => app.unmount())
  return {media, previewActive, isMounted, poster}
}

function deferredProbe() {
  let resolve!: (value: boolean) => void
  const promise = new Promise<boolean>(done => { resolve = done })
  return {promise, resolve}
}

describe('useStaticGridPoster', () => {
  it('loads a grid sprite sheet for a matching tile', async () => {
    const {poster} = setup()
    await nextTick()
    expect(poster.tileIndex.value).toBe(7)
    expect(poster.showStaticGridPoster.value).toBe(true)
    expect(poster.sheetStyle.value?.backgroundImage).toContain('grids%2F2.jpg')
    expect(poster.sheetStyle.value).toMatchObject({left: '-100%', top: '-200%'})
  })

  it('falls back when the grid sprite is missing', async () => {
    vi.mocked(probeDisplayImageUrl).mockResolvedValueOnce(false)
    const {poster} = setup()
    await nextTick()
    expect(poster.showStaticGridPoster.value).toBe(false)
  })

  it.each(['disabled', 'unmounted', 'no tile'])('cancels an unfinished probe when %s', async mode => {
    const pending = deferredProbe()
    vi.mocked(probeDisplayImageUrl).mockReturnValueOnce(pending.promise)
    const {poster, media, previewActive, isMounted} = setup()
    const signal = vi.mocked(probeDisplayImageUrl).mock.calls[0][1]
    if (mode === 'disabled') previewActive.value = false
    else if (mode === 'unmounted') isMounted.value = false
    else media.value.semanticTileIndex = 9
    await nextTick()
    expect(signal?.aborted).toBe(true)
    pending.resolve(true)
    await nextTick()
    expect(poster.spriteUrl.value).toBeNull()
    expect(poster.showStaticGridPoster.value).toBe(false)
    expect(probeDisplayImageUrl).toHaveBeenCalledTimes(1)
  })

  it('clears the previous sprite immediately when switching files', async () => {
    const {poster, media} = setup()
    await nextTick()
    expect(poster.showStaticGridPoster.value).toBe(true)
    const pending = deferredProbe()
    vi.mocked(probeDisplayImageUrl).mockReturnValueOnce(pending.promise)
    media.value = {id: 3, semanticTileIndex: 7}
    await nextTick()
    expect(poster.spriteUrl.value).toBeNull()
    pending.resolve(true)
    await nextTick()
    expect(poster.spriteUrl.value).toContain('grids%2F3.jpg')
  })

  it('does not replace a newer sprite with an old probe result', async () => {
    const old = deferredProbe()
    vi.mocked(probeDisplayImageUrl).mockReturnValueOnce(old.promise)
    const {poster, media} = setup()
    media.value = {id: 3, semanticTileIndex: 7}
    await nextTick()
    await nextTick()
    expect(poster.spriteUrl.value).toContain('grids%2F3.jpg')
    old.resolve(true)
    await nextTick()
    expect(poster.spriteUrl.value).toContain('grids%2F3.jpg')
  })

  it('aborts the active probe on component disposal', async () => {
    const pending = deferredProbe()
    vi.mocked(probeDisplayImageUrl).mockReturnValueOnce(pending.promise)
    const {poster} = setup()
    const signal = vi.mocked(probeDisplayImageUrl).mock.calls[0][1]
    cleanups.pop()!()
    expect(signal?.aborted).toBe(true)
    pending.resolve(true)
    await nextTick()
    expect(poster.spriteUrl.value).toBeNull()
  })
})
