import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildMediaDragGhostDataUrl } from './mediaDragGhost'

describe('buildMediaDragGhostDataUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns null when canvas 2d context is unavailable', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    expect(buildMediaDragGhostDataUrl({ title: 'Clip', count: 1 })).toBeNull()
  })

  it('returns a png data url when canvas works', () => {
    const fillRect = vi.fn()
    const fill = vi.fn()
    const stroke = vi.fn()
    const beginPath = vi.fn()
    const moveTo = vi.fn()
    const arcTo = vi.fn()
    const closePath = vi.fn()
    const clip = vi.fn()
    const save = vi.fn()
    const restore = vi.fn()
    const scale = vi.fn()
    const drawImage = vi.fn()
    const fillText = vi.fn()
    const measureText = vi.fn(() => ({ width: 40 }))
    const rect = vi.fn()
    const createLinearGradient = vi.fn(() => ({
      addColorStop: vi.fn(),
    }))

    const ctx = {
      fillRect,
      fill,
      stroke,
      beginPath,
      moveTo,
      arcTo,
      closePath,
      clip,
      save,
      restore,
      scale,
      drawImage,
      fillText,
      measureText,
      rect,
      createLinearGradient,
      canvas: {} as HTMLCanvasElement,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textBaseline: 'alphabetic',
      textAlign: 'left',
      shadowColor: '',
      shadowBlur: 0,
      shadowOffsetY: 0,
    } as unknown as CanvasRenderingContext2D

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAA')

    const dataUrl = buildMediaDragGhostDataUrl({
      title: 'Clip name',
      count: 3,
    })
    expect(dataUrl).toBe('data:image/png;base64,AAA')
    expect(scale).toHaveBeenCalled()
    expect(fillText).toHaveBeenCalled()
  })
})
