import { describe, expect, it, vi, beforeEach } from 'vitest'
import { probeDisplayImageUrl } from '@/utils/probeImageUrl'

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

  it('returns false for unavailable placeholders', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    await expect(probeDisplayImageUrl('/images/unavailable.png')).resolves.toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
