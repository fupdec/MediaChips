import { describe, expect, it } from 'vitest'
import {
  buildMasonryLayout,
  chunkIntoRows,
  estimateRowHeight,
  estimateMasonryItemHeight,
  findVisibleMasonryItems,
  getColumnCount,
  getDistributedCardWidth,
  getGridLayoutStyle,
  getLayoutMetrics,
  getMediaAspectRatio,
  getTargetCardWidth,
  packMasonryColumns,
  shouldUseVirtualGrid,
  shouldUseVirtualMasonry,
  VIRTUAL_GRID_THRESHOLD,
} from '@/utils/gridLayout'

describe('shouldUseVirtualGrid', () => {
  it('keeps virtualization off so fixed row estimates cannot jump scroll', () => {
    expect(shouldUseVirtualGrid(0, true, 'media')).toBe(false)
    expect(shouldUseVirtualGrid(1, true, 'media')).toBe(false)
    expect(shouldUseVirtualGrid(100, true, 'media')).toBe(false)
    expect(shouldUseVirtualGrid(VIRTUAL_GRID_THRESHOLD - 1, false, 'media')).toBe(false)
    expect(shouldUseVirtualGrid(VIRTUAL_GRID_THRESHOLD, false, 'media')).toBe(false)
    expect(shouldUseVirtualGrid(50, false, 'media')).toBe(false)
    expect(shouldUseVirtualGrid(100, false, 'tag')).toBe(false)
  })
})

describe('shouldUseVirtualMasonry', () => {
  it('follows the same rules as the row virtualizer', () => {
    expect(shouldUseVirtualMasonry(0, true, 'media')).toBe(false)
    expect(shouldUseVirtualMasonry(100, true, 'media')).toBe(false)
    expect(shouldUseVirtualMasonry(VIRTUAL_GRID_THRESHOLD - 1, false, 'media')).toBe(false)
    expect(shouldUseVirtualMasonry(VIRTUAL_GRID_THRESHOLD, false, 'media')).toBe(false)
    expect(shouldUseVirtualMasonry(50, false, 'media')).toBe(false)
  })
})

describe('chunkIntoRows', () => {
  it('groups items into rows by column count', () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]
    const rows = chunkIntoRows(items, 2)

    expect(rows).toHaveLength(3)
    expect(rows[0].items.map((item) => item.id)).toEqual([1, 2])
    expect(rows[1].items.map((item) => item.id)).toEqual([3, 4])
    expect(rows[2].items.map((item) => item.id)).toEqual([5])
    expect(rows[2].startIndex).toBe(4)
  })
})

describe('getColumnCount', () => {
  it('returns one column for line grid', () => {
    expect(getColumnCount(1200, 200, 20, { lineGrid: true })).toBe(1)
  })

  it('derives column count from container width', () => {
    const cardWidth = getTargetCardWidth({ size: 3 })
    const columns = getColumnCount(1200, cardWidth, 20)

    expect(columns).toBeGreaterThan(1)
  })
})

describe('getTargetCardWidth', () => {
  it('gives each neighboring size a distinct card width', () => {
    expect(getTargetCardWidth({ size: 2 })).toBeLessThan(getTargetCardWidth({ size: 3 }))
    expect(getTargetCardWidth({ size: 4 })).toBeLessThan(getTargetCardWidth({ size: 5 }))
    expect(getTargetCardWidth({ size: 4, imageGrid: true })).not.toBe(
      getTargetCardWidth({ size: 5, imageGrid: true }),
    )
  })
})

describe('getDistributedCardWidth', () => {
  it('fills the container for a full row', () => {
    const containerWidth = 1200
    const options = { size: 3, gapSize: 'm' }
    const gap = 20
    const target = getTargetCardWidth(options)
    const cols = getColumnCount(containerWidth, target, gap, options)
    const width = getDistributedCardWidth(containerWidth, options)

    expect(width * cols + gap * (cols - 1)).toBeCloseTo(containerWidth)
    expect(width).toBeGreaterThan(target)
  })

  it('returns target width without container width', () => {
    expect(getGridLayoutStyle({ size: 3 })['--card-width']).toBe('255px')
  })

  it('keeps L and XL distinct at common container widths', () => {
    const widths = [900, 1100, 1300, 1500, 1800]

    for (const containerWidth of widths) {
      const mediaL = getLayoutMetrics(containerWidth, { size: 4, gapSize: 'm' })
      const mediaXl = getLayoutMetrics(containerWidth, { size: 5, gapSize: 'm' })
      expect(mediaXl.cardWidth).toBeGreaterThan(mediaL.cardWidth)
      expect(mediaXl.columnCount).toBeLessThan(mediaL.columnCount)

      const imageL = getLayoutMetrics(containerWidth, { size: 4, imageGrid: true, gapSize: 'm' })
      const imageXl = getLayoutMetrics(containerWidth, { size: 5, imageGrid: true, gapSize: 'm' })
      expect(imageXl.cardWidth).toBeGreaterThan(imageL.cardWidth)
      expect(imageXl.columnCount).toBeLessThan(imageL.columnCount)
    }
  })
})

describe('getGridLayoutStyle', () => {
  it('exposes distributed card width when container width is known', () => {
    const style = getGridLayoutStyle({ size: 3, gapSize: 'm', containerWidth: 1200 })

    expect(style['--card-width']).not.toBe('255px')
    expect(style['--grid-gap-x']).toBe('20px')
    expect(style['--grid-gap-y']).toBe('25px')
  })

  it('omits card width only for chip layout', () => {
    expect(getGridLayoutStyle({ chipsGrid: true })['--card-width']).toBeUndefined()
  })

  it('exposes full width for line layout', () => {
    expect(getGridLayoutStyle({ lineGrid: true, containerWidth: 1200 })['--card-width']).toBe('1200px')
  })
})

describe('estimateRowHeight', () => {
  it('uses meta image aspect ratio for tag card grids', () => {
    const defaultHeight = estimateRowHeight({
      size: 3,
      imageAspectRatio: 1,
    })
    const wideHeight = estimateRowHeight({
      size: 3,
      imageAspectRatio: 2,
    })

    expect(wideHeight).toBeLessThan(defaultHeight)
  })

  it('uses narrower image cards with the same 16:9 preview aspect', () => {
    const imageHeight = estimateRowHeight({
      size: 3,
      imageGrid: true,
    })
    const videoHeight = estimateRowHeight({
      size: 3,
    })

    expect(imageHeight).toBeGreaterThan(0)
    expect(videoHeight).toBeGreaterThan(imageHeight)
  })

  it('scales row height with card size', () => {
    const medium = estimateRowHeight({ size: 3, containerWidth: 1200 })
    const large = estimateRowHeight({ size: 5, containerWidth: 1200 })

    expect(large).toBeGreaterThan(medium)
  })

  it('uses chip row height for chip layout', () => {
    const small = estimateRowHeight({ size: 2, chipsGrid: true, gapSize: 'xs' })
    const xlarge = estimateRowHeight({ size: 6, chipsGrid: true, gapSize: 'xs' })

    expect(small).toBe(42 + 15)
    expect(xlarge).toBe(80 + 15)
    expect(xlarge).toBeGreaterThan(small)
  })
})

describe('getMediaAspectRatio', () => {
  it('returns width divided by height', () => {
    expect(getMediaAspectRatio({ width: 1920, height: 1080 })).toBeCloseTo(16 / 9)
    expect(getMediaAspectRatio({ width: 0, height: 1080 })).toBe(1)
  })
})

describe('estimateMasonryItemHeight', () => {
  it('scales height from column width and media aspect ratio', () => {
    const height = estimateMasonryItemHeight({ width: 1000, height: 2000 }, 200)
    expect(height).toBe(400)
  })
})

describe('packMasonryColumns', () => {
  it('balances items across the shortest column', () => {
    const items = [
      { id: 1, width: 1000, height: 2000 },
      { id: 2, width: 1000, height: 500 },
      { id: 3, width: 1000, height: 500 },
    ]

    const columns = packMasonryColumns(
      items,
      2,
      (item, colWidth) => estimateMasonryItemHeight(item, colWidth),
      200,
    )

    expect(columns).toHaveLength(2)
    expect(columns[0].items).toHaveLength(1)
    expect(columns[1].items).toHaveLength(2)
    expect(columns[0].items[0].item.id).toBe(1)
    expect(columns[1].items.map((entry) => entry.item.id)).toEqual([2, 3])
  })
})

describe('buildMasonryLayout', () => {
  it('tracks absolute positions and total height with gaps', () => {
    const items = [
      { id: 1, width: 1000, height: 1000 },
      { id: 2, width: 1000, height: 500 },
      { id: 3, width: 1000, height: 500 },
    ]

    const layout = buildMasonryLayout(
      items,
      2,
      200,
      10,
      15,
      (item, colWidth) => estimateMasonryItemHeight(item, colWidth),
    )

    expect(layout.positions).toHaveLength(3)
    expect(layout.positions[0]).toMatchObject({ index: 0, column: 0, top: 0, height: 200 })
    expect(layout.positions[1]).toMatchObject({ index: 1, column: 1, top: 0, height: 100 })
    expect(layout.positions[2]).toMatchObject({ index: 2, column: 1, top: 115, height: 100 })
    expect(layout.totalHeight).toBe(215)
  })
})

describe('findVisibleMasonryItems', () => {
  it('returns only items intersecting the viewport window', () => {
    const positions = [
      { item: { id: 1 }, index: 0, column: 0, top: 0, height: 100 },
      { item: { id: 2 }, index: 1, column: 0, top: 115, height: 100 },
      { item: { id: 3 }, index: 2, column: 0, top: 230, height: 100 },
    ]

    const visible = findVisibleMasonryItems(positions, 90, 220, 0)

    expect(visible.map((entry) => entry.item.id)).toEqual([1, 2])
    expect(findVisibleMasonryItems(positions, 250, 400, 0).map((entry) => entry.item.id)).toEqual([3])
  })
})
