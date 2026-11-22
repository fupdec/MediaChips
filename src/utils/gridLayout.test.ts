import { describe, expect, it } from 'vitest'
import {
  getCardChipLimit,
  getCardSizeForWidth,
  averageMeasuredRowStride,
  buildMasonryLayout,
  chunkIntoRows,
  estimateRowHeight,
  estimateMasonryItemHeight,
  findVariableRowAtOffset,
  findVisibleMasonryItems,
  getColumnCount,
  getDistributedCardWidth,
  getFluidChipUnit,
  getGridLayoutStyle,
  getLayoutGap,
  getLayoutMetrics,
  getMediaAspectRatio,
  getMinimalFilenameHeight,
  getTargetCardWidth,
  getVariableGridHeight,
  getVariableRowOffset,
  getVariableRowStride,
  packMasonryColumns,
  shouldUseVirtualGrid,
  shouldUseVirtualMasonry,
  VIRTUAL_GRID_THRESHOLD,
} from '@/utils/gridLayout'

describe('shouldUseVirtualGrid', () => {
  it('stays off for empty lists, tags, and small paginated pages', () => {
    expect(shouldUseVirtualGrid(0, true, 'media')).toBe(false)
    expect(shouldUseVirtualGrid(0, false, 'media')).toBe(false)
    expect(shouldUseVirtualGrid(VIRTUAL_GRID_THRESHOLD - 1, false, 'media')).toBe(false)
    expect(shouldUseVirtualGrid(VIRTUAL_GRID_THRESHOLD, false, 'tag')).toBe(false)
    expect(shouldUseVirtualGrid(100, false, 'tag')).toBe(false)
  })

  it('turns on for infinite media from the first loaded item', () => {
    expect(shouldUseVirtualGrid(1, true, 'media')).toBe(true)
    expect(shouldUseVirtualGrid(100, true, 'media')).toBe(true)
  })

  it('turns on for paginated media lists at the threshold', () => {
    expect(shouldUseVirtualGrid(VIRTUAL_GRID_THRESHOLD, false, 'media')).toBe(true)
    expect(shouldUseVirtualGrid(100, false, 'media')).toBe(true)
  })

  it('respects the feature flag', () => {
    expect(shouldUseVirtualGrid(100, true, 'media', {enabled: false})).toBe(false)
    expect(shouldUseVirtualGrid(100, false, 'media', {enabled: false})).toBe(false)
  })
})

describe('shouldUseVirtualMasonry', () => {
  const sized = Array.from({length: 60}, (_, i) => ({id: i, width: 100, height: 200}))
  const mostlySized = [
    ...sized.slice(0, 56),
    {id: 56, width: 0, height: 0},
    {id: 57, width: 0, height: 0},
    {id: 58},
    {id: 59},
  ]

  it('requires media threshold and stable dimensions, including infinite scroll', () => {
    expect(shouldUseVirtualMasonry(60, true, 'media', {items: sized})).toBe(true)
    expect(shouldUseVirtualMasonry(60, false, 'media', {items: sized})).toBe(true)
    expect(shouldUseVirtualMasonry(60, true, 'media', {items: mostlySized})).toBe(false)
    expect(shouldUseVirtualMasonry(20, true, 'media', {items: sized.slice(0, 20)})).toBe(false)
    expect(shouldUseVirtualMasonry(60, true, 'tag', {items: sized})).toBe(false)
  })

  it('respects the feature flag', () => {
    expect(shouldUseVirtualMasonry(60, true, 'media', {items: sized, enabled: false})).toBe(false)
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
  it('keeps the target width and fits complete columns', () => {
    const containerWidth = 1200
    const options = { size: 3, gapSize: 'm' }
    const gap = 20
    const target = getTargetCardWidth(options)
    const cols = getColumnCount(containerWidth, target, gap, options)
    const width = getDistributedCardWidth(containerWidth, options)

    expect(width * cols + gap * (cols - 1)).toBeLessThanOrEqual(containerWidth)
    expect(width).toBe(target)
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
      expect(mediaXl.columnCount).toBeLessThanOrEqual(mediaL.columnCount)

      const imageL = getLayoutMetrics(containerWidth, { size: 4, imageGrid: true, gapSize: 'm' })
      const imageXl = getLayoutMetrics(containerWidth, { size: 5, imageGrid: true, gapSize: 'm' })
      expect(imageXl.cardWidth).toBeGreaterThan(imageL.cardWidth)
      expect(imageXl.columnCount).toBeLessThanOrEqual(imageL.columnCount)
    }
  })
})

describe('getGridLayoutStyle', () => {
  it('exposes distributed card width when container width is known', () => {
    const style = getGridLayoutStyle({ size: 3, gapSize: 'm', containerWidth: 1200 })

    expect(style['--card-width']).toBe('255px')
    expect(style['--grid-gap-x']).toBe('20px')
    expect(style['--grid-gap-y']).toBe('25px')
  })

  it('omits card width only for chip layout', () => {
    expect(getGridLayoutStyle({ chipsGrid: true })['--card-width']).toBeUndefined()
  })

  it('exposes description height estimate for initial layout', () => {
    expect(getGridLayoutStyle({ size: 3 })['--card-description-height']).toBe('140px')
    expect(getGridLayoutStyle({ size: 1 })['--card-description-height']).toBe('118px')
  })
})

describe('variable row height helpers', () => {
  const measured = new Map<number, number>([
    [0, 200],
    [2, 400],
  ])
  const estimated = 300

  it('uses measured strides when present', () => {
    expect(getVariableRowStride(0, measured, estimated)).toBe(200)
    expect(getVariableRowStride(1, measured, estimated)).toBe(300)
    expect(getVariableRowStride(2, measured, estimated)).toBe(400)
  })

  it('builds offsets and total height from mixed strides', () => {
    expect(getVariableRowOffset(0, measured, estimated)).toBe(0)
    expect(getVariableRowOffset(1, measured, estimated)).toBe(200)
    expect(getVariableRowOffset(2, measured, estimated)).toBe(500)
    expect(getVariableRowOffset(3, measured, estimated)).toBe(900)
    expect(getVariableGridHeight(3, measured, estimated)).toBe(900)
  })

  it('finds the row for a scroll offset', () => {
    expect(findVariableRowAtOffset(0, 3, measured, estimated)).toBe(0)
    expect(findVariableRowAtOffset(199, 3, measured, estimated)).toBe(0)
    expect(findVariableRowAtOffset(200, 3, measured, estimated)).toBe(1)
    expect(findVariableRowAtOffset(500, 3, measured, estimated)).toBe(2)
    expect(findVariableRowAtOffset(10_000, 3, measured, estimated)).toBe(2)
  })

  it('averages measured strides for seekers', () => {
    expect(averageMeasuredRowStride(new Map(), estimated)).toBe(estimated)
    expect(averageMeasuredRowStride(measured, estimated)).toBe(Math.round((200 + 400) / 2))
  })

  it('matches linear geometry when only a few rows are measured', () => {
    const sparse = new Map<number, number>([[10, 500], [50, 100]])
    const est = 300
    // Unmeasured prefix: 10 * 300; row 10 contributes 500 → offset(11) = 10*300 + 500
    expect(getVariableRowOffset(11, sparse, est)).toBe(10 * est + 500)
    expect(getVariableGridHeight(51, sparse, est)).toBe(
      51 * est + (500 - est) + (100 - est),
    )
    expect(findVariableRowAtOffset(10 * est + 100, 60, sparse, est)).toBe(10)
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

  it('uses compact height for minimalism (thumb + filename)', () => {
    const card = estimateRowHeight({
      size: 3,
      containerWidth: 1200,
    })
    const minimal = estimateRowHeight({
      size: 3,
      containerWidth: 1200,
      imageOnly: true,
    })

    expect(minimal).toBeLessThan(card)
    expect(card - minimal).toBeGreaterThan(80)
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

  it('sizes timeline rows to fit the story strip height', () => {
    const gapY = 20
    const medium = estimateRowHeight({ size: 3, lineGrid: true, gapSize: 's' })
    const large = estimateRowHeight({ size: 5, lineGrid: true, gapSize: 's' })

    // story 180 + meta 44 + progress 4 + gap
    expect(medium).toBe(180 + 44 + 4 + gapY)
    expect(large).toBe(260 + 44 + 4 + gapY)
    expect(large).toBeGreaterThan(medium)
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

describe('getCardChipLimit', () => {
  it('keeps 12 chips for M cards with a 16:9 preview', () => {
    expect(getCardChipLimit(3, 16 / 9)).toBe(12)
  })

  it('shows more chips on L/XL/XXL cards', () => {
    expect(getCardChipLimit(4)).toBeGreaterThan(getCardChipLimit(3))
    expect(getCardChipLimit(5)).toBeGreaterThan(getCardChipLimit(4))
    expect(getCardChipLimit(6)).toBeGreaterThan(getCardChipLimit(5))
  })

  it('shows fewer chips under portrait previews', () => {
    expect(getCardChipLimit(6, 0.625)).toBeLessThan(getCardChipLimit(6, 1))
    expect(getCardChipLimit(6, 1)).toBeLessThan(getCardChipLimit(6, 16 / 9))
    expect(getCardChipLimit(1, 0.4)).toBeGreaterThanOrEqual(6)
  })

  it('treats wider-than-16:9 and invalid ratios as 16:9', () => {
    expect(getCardChipLimit(4, 3)).toBe(getCardChipLimit(4, 16 / 9))
    expect(getCardChipLimit(4, 0)).toBe(getCardChipLimit(4, 16 / 9))
  })
})

describe('getFluidChipUnit', () => {
  it('matches the per-size values at the default tier widths', () => {
    const expected: Array<[number, number]> = [
      [150, 8], [200, 8.5], [255, 10], [315, 12.5], [405, 16], [520, 22],
    ]
    for (const [width, unit] of expected) {
      expect(getFluidChipUnit(width)).toBe(unit)
    }
  })

  it('interpolates between tiers and clamps outside the range', () => {
    expect(getFluidChipUnit(285)).toBeGreaterThan(10)
    expect(getFluidChipUnit(285)).toBeLessThan(12.5)
    expect(getFluidChipUnit(50)).toBe(8)
    expect(getFluidChipUnit(900)).toBe(22)
    expect(getFluidChipUnit(Number.NaN)).toBe(8)
  })

  it('is exposed for card grids only', () => {
    expect(getGridLayoutStyle({ size: 3 })['--chip-unit-fluid']).toBe('10px')
    expect(getGridLayoutStyle({ size: 3, containerWidth: 1200, listGrid: true })['--chip-unit-fluid']).toBeUndefined()
    expect(getGridLayoutStyle({ size: 3, containerWidth: 1200, lineGrid: true })['--chip-unit-fluid']).toBeUndefined()
    expect(getGridLayoutStyle({ chipsGrid: true })['--chip-unit-fluid']).toBeUndefined()
  })
})

describe('getLayoutMetrics single-column growth', () => {
  it('keeps every size wider than the previous one until the container limit', () => {
    const types = [{}, { imageGrid: true }, { wideImage: true }]

    for (const type of types) {
      for (const containerWidth of [640, 800, 1000, 1200, 1600]) {
        let prevWidth = 0
        for (let size = 1; size <= 6; size += 1) {
          const { cardWidth } = getLayoutMetrics(containerWidth, { size, gapSize: 'xs', ...type })
          expect(cardWidth).toBeLessThanOrEqual(containerWidth)
          if (cardWidth < containerWidth) expect(cardWidth).toBeGreaterThan(prevWidth)
          prevWidth = cardWidth
        }
      }
    }
  })

  it('does not stretch a single column to the full container when a larger size follows', () => {
    const containerWidth = 600
    const xl = getLayoutMetrics(containerWidth, { size: 5, gapSize: 'xs' })
    const xxl = getLayoutMetrics(containerWidth, { size: 6, gapSize: 'xs' })

    expect(xl.columnCount).toBe(1)
    expect(xl.cardWidth).toBeLessThan(containerWidth)
    expect(xxl.cardWidth).toBeGreaterThan(xl.cardWidth)
  })
})


describe('continuous card sizing', () => {
  it('grows smoothly across column boundaries for each card type', () => {
    for (const type of [{}, {imageGrid: true}, {wideImage: true}]) {
      let previous = getLayoutMetrics(1000, {size: 1, ...type})
      for (let step = 101; step <= 600; step++) {
        const current = getLayoutMetrics(1000, {size: step / 100, ...type})
        expect(current.cardWidth).toBeGreaterThan(previous.cardWidth)
        expect(current.cardWidth - previous.cardWidth).toBeLessThan(1.2)
        expect(current.columnCount * current.cardWidth + (current.columnCount - 1) * 10).toBeLessThanOrEqual(1000)
        previous = current
      }
    }
  })

  it('clamps cards to narrow containers', () => {
    expect(getLayoutMetrics(120, {size: 5.25}).cardWidth).toBe(120)
  })
})


describe('automatic card gaps', () => {
  it('keeps gaps compact at fractional sizes and never overflows a row', () => {
    for (const containerWidth of [120, 600, 628, 1000, 1450]) {
      for (const size of [1, 2.37, 3, 4.56, 6]) {
        const options = {size, containerWidth, gapSize: 'auto'}
        const {columnCount, cardWidth} = getLayoutMetrics(containerWidth, options)
        const spacing = getLayoutGap(options)
        expect(spacing.y).toBe(spacing.x)
        const gap = spacing.x
        expect(gap).toBeGreaterThanOrEqual(10)
        expect(gap).toBeLessThanOrEqual(24)
        expect(columnCount * cardWidth + (columnCount - 1) * gap).toBeCloseTo(containerWidth)
      }
    }
  })

  it('uses the same spacing in CSS and virtual row estimates', () => {
    for (const size of [1, 2.37, 4.4, 6]) {
      const options = {size, containerWidth: 1000, gapSize: 'auto'}
      const spacing = getLayoutGap(options)
      const style = getGridLayoutStyle(options)
      expect(style['--grid-gap-y']).toBe(style['--grid-gap-x'])
      // With no description/progress in minimalism, the stride is exact.
      const {cardWidth} = getLayoutMetrics(1000, options)
      expect(estimateRowHeight({...options, imageOnly: true})).toBeCloseTo(
        cardWidth / (16 / 9) + getMinimalFilenameHeight(getCardSizeForWidth(cardWidth)) + spacing.y,
      )
    }
    expect(getLayoutGap({gapSize: 'auto'})).toEqual({x: 10, y: 10})
  })

  it('fills the former empty right side, including a single column', () => {
    for (const size of [3, 4.4, 6]) {
      const options = {size, containerWidth: 628, gapSize: 'auto'}
      const {columnCount, cardWidth} = getLayoutMetrics(628, options)
      expect(columnCount * cardWidth + (columnCount - 1) * getLayoutGap(options).x).toBeCloseTo(628)
    }
  })

  it('changes card width smoothly while the column count stays the same', () => {
    const before = getLayoutMetrics(1000, {size: 3.1, gapSize: 'auto'})
    const after = getLayoutMetrics(1000, {size: 3.11, gapSize: 'auto'})
    expect(after.columnCount).toBe(before.columnCount)
    expect(after.cardWidth).toBeGreaterThan(before.cardWidth)
    expect(after.cardWidth - before.cardWidth).toBeLessThan(1)
  })
})

describe('card contents follow actual width', () => {
  it('uses identical scale for equally wide cards regardless of slider or layout type', () => {
    const regular = getGridLayoutStyle({size: 2})
    const wide = getGridLayoutStyle({size: 1, wideImage: true})
    expect(regular).toEqual(wide)

    const small = getGridLayoutStyle({size: 1})
    const constrained = getGridLayoutStyle({size: 6, containerWidth: 150})
    expect(constrained).toEqual(small)
  })

  it('scales fonts, icons, insets and height estimates continuously across old tiers', () => {
    const properties = ['--card-font-size', '--card-description-font-size', '--card-rating-icon', '--card-fav-icon', '--card-title-scale', '--card-chip-inset-factor', '--card-description-height']
    for (const boundary of [1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5]) {
      const before = getGridLayoutStyle({size: boundary - 0.001})
      const after = getGridLayoutStyle({size: boundary + 0.001})
      for (const property of properties) {
        expect(Math.abs(parseFloat(after[property]) - parseFloat(before[property]))).toBeLessThan(0.1)
      }
    }
  })

  it('converts the reference widths and safely clamps visual scale', () => {
    expect(getCardSizeForWidth(150)).toBe(1)
    expect(getCardSizeForWidth(255)).toBe(3)
    expect(getCardSizeForWidth(285)).toBe(3.5)
    expect(getCardSizeForWidth(100)).toBe(1)
    expect(getCardSizeForWidth(1000)).toBe(6)
    expect(getCardSizeForWidth(NaN)).toBe(3)
  })
})
