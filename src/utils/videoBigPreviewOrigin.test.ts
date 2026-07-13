import {describe, expect, it} from 'vitest'
import {
  applyVideoBigPreviewOrigin,
  captureVideoBigPreviewOrigin,
  clearVideoBigPreviewOrigin,
} from './videoBigPreviewOrigin'

describe('videoBigPreviewOrigin', () => {
  it('captures viewport coordinates from element rect', () => {
    const element = {
      getBoundingClientRect: () => ({
        top: 120,
        left: 240,
        right: 388,
        bottom: 203,
        width: 148,
        height: 83,
        x: 240,
        y: 120,
        toJSON: () => ({}),
      }),
    } as HTMLElement

    expect(captureVideoBigPreviewOrigin(element)).toEqual({
      top: '120px',
      left: '240px',
      width: '148px',
      height: '83px',
    })
  })

  it('applies and clears css variables', () => {
    const element = document.createElement('div')
    const origin = {
      top: '10px',
      left: '20px',
      width: '30px',
      height: '40px',
    }

    applyVideoBigPreviewOrigin(element, origin)
    expect(element.style.getPropertyValue('--preview-top')).toBe('10px')
    expect(element.style.getPropertyValue('--preview-left')).toBe('20px')
    expect(element.style.getPropertyValue('--preview-width')).toBe('30px')
    expect(element.style.getPropertyValue('--preview-height')).toBe('40px')

    clearVideoBigPreviewOrigin(element)
    expect(element.style.getPropertyValue('--preview-top')).toBe('')
    expect(element.style.getPropertyValue('--preview-left')).toBe('')
    expect(element.style.getPropertyValue('--preview-width')).toBe('')
    expect(element.style.getPropertyValue('--preview-height')).toBe('')
  })
})
