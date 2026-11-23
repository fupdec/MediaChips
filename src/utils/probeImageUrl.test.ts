import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { probeDisplayImageUrl, warmDisplayImageUrl } from '@/utils/probeImageUrl'

afterEach(() => vi.unstubAllGlobals())

describe('probeDisplayImageUrl', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('uses HEAD for API file URLs', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
    } as Response)

    await expect(
      probeDisplayImageUrl('/api/get-file?url=test.jpg'),
    ).resolves.toBe(true)

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/get-file?url=test.jpg',
      expect.objectContaining({ method: 'HEAD' }),
    )
  })

  it('checks the loaded image URL before clearing it', async () => {
    class FakeImage {
      static instances: FakeImage[] = []
      src = ''
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor() { FakeImage.instances.push(this) }
    }
    vi.stubGlobal('Image', FakeImage)
    const result = probeDisplayImageUrl('file:///media/grid.jpg')
    const [image] = FakeImage.instances
    expect(image.src).toBe('file:///media/grid.jpg')
    image.onload!()
    await expect(result).resolves.toBe(true)
    expect(image.src).toBe('')
    expect(image.onload).toBeNull()
    expect(image.onerror).toBeNull()
  })

  it('returns false for unavailable placeholders', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    await expect(probeDisplayImageUrl('/images/unavailable.png')).resolves.toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('warmDisplayImageUrl', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('no-ops for unavailable placeholders', async () => {
    await expect(warmDisplayImageUrl('/images/unavailable.png')).resolves.toBeUndefined()
  })

  it('loads the URL through Image()', async () => {
    class FakeImage {
      decoding = ''
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      decode = vi.fn(async () => undefined)
      set src (_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    }

    vi.stubGlobal('Image', FakeImage as unknown as typeof Image)
    await expect(warmDisplayImageUrl('/api/get-file?url=thumb.jpg')).resolves.toBeUndefined()
  })
})
