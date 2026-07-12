export const VIDEO_THUMB_HEIGHT = 320
export const VIDEO_THUMB_JPEG_QUALITY = 4

export const VIDEO_MARK_HEIGHT = 180
export const VIDEO_MARK_JPEG_QUALITY = 4

export const VIDEO_GRID_REFERENCE_ASPECT_RATIO = 16 / 9

export const VIDEO_GRID_JPEG_QUALITY = 6

/** 3x3 sprite sheet used for grid cards and timeline hover previews. */
export const VIDEO_GRID_SPRITE = {
  cols: 3,
  rows: 3,
  /** Tile width for 16:9 videos. Portrait and narrower formats scale down proportionally. */
  tileWidth: 360,
} as const

export interface GridTileDimensions {
  tileWidth: number
  tileHeight: number
}

export interface GridSpriteDimensions extends GridTileDimensions {
  width: number
  height: number
}

export function getGridTileDimensions(
  aspectRatio: number,
  referenceTileWidth = VIDEO_GRID_SPRITE.tileWidth,
  referenceAspectRatio = VIDEO_GRID_REFERENCE_ASPECT_RATIO,
): GridTileDimensions {
  const normalizedAspectRatio = Number.isFinite(aspectRatio) && aspectRatio > 0
    ? aspectRatio
    : referenceAspectRatio
  const referenceTileHeight = referenceTileWidth / referenceAspectRatio

  if (normalizedAspectRatio >= referenceAspectRatio) {
    return {
      tileWidth: referenceTileWidth,
      tileHeight: Math.round(referenceTileWidth / normalizedAspectRatio),
    }
  }

  return {
    tileWidth: Math.round(referenceTileHeight * normalizedAspectRatio),
    tileHeight: Math.round(referenceTileHeight),
  }
}

export function getGridSpriteDimensions(
  aspectRatio: number,
  cols: number = VIDEO_GRID_SPRITE.cols,
  rows: number = VIDEO_GRID_SPRITE.rows,
): GridSpriteDimensions {
  const {tileWidth, tileHeight} = getGridTileDimensions(aspectRatio)

  return {
    tileWidth,
    tileHeight,
    width: tileWidth * cols,
    height: tileHeight * rows,
  }
}

export function getVideoGridSpriteWidth(
  aspectRatio: number = VIDEO_GRID_REFERENCE_ASPECT_RATIO,
  cols: number = VIDEO_GRID_SPRITE.cols,
): number {
  return getGridSpriteDimensions(aspectRatio, cols).width
}

export function buildVideoGridTaskParams(input: string, output: string) {
  return {
    input,
    output,
    width: VIDEO_GRID_SPRITE.tileWidth,
    cols: VIDEO_GRID_SPRITE.cols,
    rows: VIDEO_GRID_SPRITE.rows,
  }
}
