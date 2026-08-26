export const GRID_SPRITE = {
  cols: 3,
  rows: 3,
  tileCount: 9,
} as const

export const PREVIEW_CONTAINER_ASPECT_RATIO = 16 / 9

/** Relative AR slack: near-16:9 cards fill edge-to-edge; others letterbox. */
export const PREVIEW_ASPECT_MATCH_EPSILON = 0.03

export type GridFrameIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

export function isNearPreviewContainerAspect(
  mediaAspectRatio: number,
  containerAspectRatio = PREVIEW_CONTAINER_ASPECT_RATIO,
  epsilon = PREVIEW_ASPECT_MATCH_EPSILON,
): boolean {
  if (!Number.isFinite(mediaAspectRatio) || mediaAspectRatio <= 0) return true
  if (!Number.isFinite(containerAspectRatio) || containerAspectRatio <= 0) return false
  return Math.abs(mediaAspectRatio - containerAspectRatio) / containerAspectRatio <= epsilon
}

export function getGridFramePercent(index: number): number {
  return ((index + 0.5) / GRID_SPRITE.tileCount) * 100
}

export function pickGridFrameIndex(hoverPercent: number): GridFrameIndex {
  const clamped = Math.max(0, Math.min(100, hoverPercent))
  let nearest = 0
  let minDistance = Infinity

  for (let index = 0; index < GRID_SPRITE.tileCount; index++) {
    const distance = Math.abs(clamped - getGridFramePercent(index))
    if (distance < minDistance) {
      minDistance = distance
      nearest = index
    }
  }

  return nearest as GridFrameIndex
}

export function gridFrameCell(index: number): {col: number; row: number} {
  return {
    col: index % GRID_SPRITE.cols,
    row: Math.floor(index / GRID_SPRITE.cols),
  }
}

export function gridFrameBackgroundPosition(index: number): string {
  const {col, row} = gridFrameCell(index)
  const x = col === 0 ? '0%' : col === 1 ? '50%' : '100%'
  const y = row === 0 ? '0%' : row === 1 ? '50%' : '100%'
  return `${x} ${y}`
}

export function getContainedFrameSizePercents(
  mediaAspectRatio: number,
  containerAspectRatio = PREVIEW_CONTAINER_ASPECT_RATIO,
): {width: string; height: string} {
  if (!Number.isFinite(mediaAspectRatio) || mediaAspectRatio <= 0) {
    return {width: '100%', height: '100%'}
  }

  if (mediaAspectRatio >= containerAspectRatio) {
    const heightPercent = (containerAspectRatio / mediaAspectRatio) * 100
    return {width: '100%', height: `${heightPercent}%`}
  }

  const widthPercent = (mediaAspectRatio / containerAspectRatio) * 100
  return {width: `${widthPercent}%`, height: '100%'}
}

/**
 * Contain a tile in the actual preview box (same model as v-img contain).
 * Percentage height against a theoretical 16:9 box misses the 1px thumb oversample.
 */
export function getContainedFrameBoxStyle(
  mediaAspectRatio: number,
  containerAspectRatio = PREVIEW_CONTAINER_ASPECT_RATIO,
): Record<string, string> {
  const ratio = Number.isFinite(mediaAspectRatio) && mediaAspectRatio > 0
    ? mediaAspectRatio
    : containerAspectRatio

  if (ratio >= containerAspectRatio) {
    return {
      width: '100%',
      height: 'auto',
      aspectRatio: String(ratio),
    }
  }

  return {
    height: '100%',
    width: 'auto',
    aspectRatio: String(ratio),
  }
}

export function buildGridSpriteViewportStyle(
  mediaAspectRatio = PREVIEW_CONTAINER_ASPECT_RATIO,
  containerAspectRatio = PREVIEW_CONTAINER_ASPECT_RATIO,
): Record<string, string> {
  const shell = {
    flexShrink: '0',
    overflow: 'hidden',
    position: 'relative',
  } as const

  // Near 16:9: fill the oversampled thumb box. Other ratios letterbox like contain.
  if (isNearPreviewContainerAspect(mediaAspectRatio, containerAspectRatio)) {
    return {
      width: '100%',
      height: '100%',
      ...shell,
    }
  }

  return {
    ...getContainedFrameBoxStyle(mediaAspectRatio, containerAspectRatio),
    ...shell,
  }
}

/**
 * Inner 3×3 sheet. `left`/`top` percentages are of the tile box, so one step
 * is exactly one frame — unlike background-position % which rounds against
 * (container − 300% image) and shows a sliver of the neighbor tile.
 */
export function buildGridSpriteSheetStyle(
  spriteUrl: string,
  frameIndex: number,
): Record<string, string> {
  const {col, row} = gridFrameCell(frameIndex)
  return {
    backgroundImage: `url("${spriteUrl}")`,
    backgroundSize: '100% 100%',
    backgroundRepeat: 'no-repeat',
    width: `${GRID_SPRITE.cols * 100}%`,
    height: `${GRID_SPRITE.rows * 100}%`,
    left: `${-col * 100}%`,
    top: `${-row * 100}%`,
  }
}

export function buildGridSpriteBackgroundStyle(
  spriteUrl: string,
  frameIndex: number,
): Record<string, string> {
  return {
    backgroundImage: `url("${spriteUrl}")`,
    backgroundSize: `${GRID_SPRITE.cols * 100}% ${GRID_SPRITE.rows * 100}%`,
    backgroundPosition: gridFrameBackgroundPosition(frameIndex),
    backgroundRepeat: 'no-repeat',
  }
}

export function buildGridSpriteFrameStyle(
  spriteUrl: string,
  frameIndex: number,
  mediaAspectRatio = PREVIEW_CONTAINER_ASPECT_RATIO,
  containerAspectRatio = PREVIEW_CONTAINER_ASPECT_RATIO,
): Record<string, string> {
  return {
    ...getContainedFrameSizePercents(mediaAspectRatio, containerAspectRatio),
    flexShrink: '0',
    ...buildGridSpriteBackgroundStyle(spriteUrl, frameIndex),
  }
}

export function buildContainedThumbFallbackStyle(
  thumbUrl: string,
  mediaAspectRatio = PREVIEW_CONTAINER_ASPECT_RATIO,
  containerAspectRatio = PREVIEW_CONTAINER_ASPECT_RATIO,
): Record<string, string> {
  return {
    ...getContainedFrameSizePercents(mediaAspectRatio, containerAspectRatio),
    flexShrink: '0',
    backgroundImage: `url("${thumbUrl}")`,
    backgroundSize: 'contain',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  }
}

export function buildStoryGridSpriteFrameStyle(
  spriteUrl: string,
  frameIndex: number,
  mediaAspectRatio = PREVIEW_CONTAINER_ASPECT_RATIO,
): Record<string, string> {
  const aspectRatio = Number.isFinite(mediaAspectRatio) && mediaAspectRatio > 0
    ? String(mediaAspectRatio)
    : String(PREVIEW_CONTAINER_ASPECT_RATIO)

  return {
    height: '100%',
    aspectRatio,
    flexShrink: '0',
    ...buildGridSpriteBackgroundStyle(spriteUrl, frameIndex),
  }
}

export function buildStoryThumbFallbackStyle(
  thumbUrl: string,
  mediaAspectRatio = PREVIEW_CONTAINER_ASPECT_RATIO,
): Record<string, string> {
  const aspectRatio = Number.isFinite(mediaAspectRatio) && mediaAspectRatio > 0
    ? String(mediaAspectRatio)
    : String(PREVIEW_CONTAINER_ASPECT_RATIO)

  return {
    height: '100%',
    aspectRatio,
    flexShrink: '0',
    backgroundImage: `url("${thumbUrl}")`,
    backgroundSize: 'contain',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  }
}

export const GRID_FRAME_INDEXES = Array.from(
  {length: GRID_SPRITE.tileCount},
  (_, index) => index,
) as GridFrameIndex[]
