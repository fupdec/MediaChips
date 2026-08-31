import {describe, expect, it} from 'vitest'
import {
  cursorFromGridElement,
  findNeighborItemElement,
  pathBasename,
  uniqueVisibleGridElements,
} from './useBrowserLayoutHotkeys'

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

function makeFolder(path: string, left = 0, top = 0, width = 100, height = 120): HTMLElement {
  const el = {
    dataset: {folderPath: path},
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

  it('moves between folder tiles and media cards', () => {
    const folder = makeFolder('/movies', 40, 200)
    const media = makeItem(9, 200, 200)
    const candidates = [folder, media]

    expect(findNeighborItemElement(folder, 'right', candidates)?.dataset.itemId).toBe('9')
    expect(findNeighborItemElement(media, 'left', candidates)?.dataset.folderPath).toBe('/movies')
  })
})

describe('cursorFromGridElement', () => {
  it('reads folder, pending, and media dataset keys', () => {
    expect(cursorFromGridElement(makeFolder('/a/b'))).toEqual({kind: 'folder', path: '/a/b'})
    expect(cursorFromGridElement(makeItem(12, 0, 0))).toEqual({kind: 'media', id: 12})
    const pending = {dataset: {pendingPath: '/tmp/file.mp4'}} as unknown as HTMLElement
    expect(cursorFromGridElement(pending)).toEqual({kind: 'pending', path: '/tmp/file.mp4'})
  })
})

describe('pathBasename', () => {
  it('returns the last segment for posix and windows paths', () => {
    expect(pathBasename('/Users/me/Movies')).toBe('Movies')
    expect(pathBasename('C:\\Users\\me\\Downloads')).toBe('Downloads')
  })
})

describe('uniqueVisibleGridElements', () => {
  it('keeps the first node for a duplicated media id', () => {
    const wrapper = makeItem(7, 0, 0)
    const inner = makeItem(7, 0, 0)
    const folder = makeFolder('/a')
    const unique = uniqueVisibleGridElements([wrapper, inner, folder])
    expect(unique).toHaveLength(2)
    expect(unique[0]).toBe(wrapper)
    expect(unique[1]).toBe(folder)
  })

  it('keeps media nodes when filtering out folder tiles', () => {
    const folder = makeFolder('/movies')
    const media = makeItem(3, 0, 0)
    const unique = uniqueVisibleGridElements([folder, media])
      .filter((el) => Number.isFinite(Number(el.dataset.itemId)))
    expect(unique).toEqual([media])
  })
})
