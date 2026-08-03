/**
 * @vitest-environment node
 */
import {describe, expect, it} from 'vitest'
import {findNeighborItemElement} from './useBrowserLayoutHotkeys'

function makeItem(id: number, left: number, top: number, width = 100, height = 120): HTMLElement {
  const el = {
    dataset: {itemId: String(id)},
    getBoundingClientRect: () => ({
      x: left,
      y: top,
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
      toJSON() {
        return {}
      },
    }),
  }
  return el as unknown as HTMLElement
}

describe('findNeighborItemElement', () => {
  it('picks the nearest card in each direction', () => {
    const center = makeItem(1, 200, 200)
    const left = makeItem(2, 40, 200)
    const right = makeItem(3, 360, 200)
    const up = makeItem(4, 200, 40)
    const down = makeItem(5, 200, 360)
    const candidates = [center, left, right, up, down]

    expect(findNeighborItemElement(center, 'left', candidates)?.dataset.itemId).toBe('2')
    expect(findNeighborItemElement(center, 'right', candidates)?.dataset.itemId).toBe('3')
    expect(findNeighborItemElement(center, 'up', candidates)?.dataset.itemId).toBe('4')
    expect(findNeighborItemElement(center, 'down', candidates)?.dataset.itemId).toBe('5')
  })

  it('prefers aligned cards over distant diagonals', () => {
    const center = makeItem(1, 200, 200)
    const alignedRight = makeItem(2, 360, 210)
    const farDiagonal = makeItem(3, 500, 40)
    const candidates = [center, alignedRight, farDiagonal]

    expect(findNeighborItemElement(center, 'right', candidates)?.dataset.itemId).toBe('2')
  })
})
