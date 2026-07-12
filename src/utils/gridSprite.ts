export const GRID_SPRITE = {
  cols: 3,
  rows: 3,
  tileCount: 9,
} as const

export const PREVIEW_CONTAINER_ASPECT_RATIO = 16 / 9

export type GridFrameIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

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

export function gridFrameBackgroundPosition(index: number): string {
  const col = index % GRID_SPRITE.cols
  const row = Math.floor(index / GRID_SPRITE.cols)
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
