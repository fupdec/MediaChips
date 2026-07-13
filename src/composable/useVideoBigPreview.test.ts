import {describe, expect, it, vi} from 'vitest'
import {
  captureVideoBigPreviewRect,
  getFullscreenPreviewRect,
  useVideoBigPreview,
} from './useVideoBigPreview'

describe('useVideoBigPreview', () => {
  it('captures element rect', () => {
    const element = {
      getBoundingClientRect: () => ({
        top: 120,
        left: 240,
        width: 148,
        height: 83,
        right: 388,
        bottom: 203,
        x: 240,
        y: 120,
        toJSON: () => ({}),
      }),
    } as HTMLElement

    expect(captureVideoBigPreviewRect(element)).toEqual({
      top: 120,
      left: 240,
      width: 148,
      height: 83,
    })
  })

  it('expands and collapses with web animations', async () => {
    const element = document.createElement('div')
    element.animate = vi.fn(() => ({
      finished: Promise.resolve(),
      cancel: vi.fn(),
    })) as unknown as typeof element.animate

    const controller = useVideoBigPreview()
    const sourceRect = {top: 10, left: 20, width: 100, height: 60}

    await expect(controller.expand(element, sourceRect)).resolves.toBe(true)
    expect(controller.phase.value).toBe('expanded')
    expect(controller.isExpanded.value).toBe(true)

    await controller.collapse(element, sourceRect)

    expect(controller.phase.value).toBe('idle')
    expect(element.animate).toHaveBeenCalled()
  })

  it('returns fullscreen viewport rect', () => {
    vi.stubGlobal('innerWidth', 1920)
    vi.stubGlobal('innerHeight', 1080)

    expect(getFullscreenPreviewRect()).toEqual({
      top: 0,
      left: 0,
      width: 1920,
      height: 1080,
    })
  })
})
