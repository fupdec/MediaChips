export const VIDEO_THUMB_HEIGHT = 320
export const VIDEO_THUMB_JPEG_QUALITY = 4

export const VIDEO_MARK_HEIGHT = 180
export const VIDEO_MARK_JPEG_QUALITY = 4

export const VIDEO_GRID_REFERENCE_ASPECT_RATIO = 16 / 9

export const VIDEO_GRID_JPEG_QUALITY = 4

/** 3x3 sprite sheet used for grid cards and timeline hover previews. */
export const VIDEO_GRID_SPRITE = {
  cols: 3,
  rows: 3,
  /**
   * Tile width for 16:9 videos. Sized for full-card hover scrub near Retina
   * default card width. Portrait and narrower formats scale down proportionally.
   */
  tileWidth: 480,
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

/** ffmpeg xstack layout cell for tile index `i` in a `cols`-wide grid. */
export function makeXstackLayout(i: number, cols: number): string {
  const currentColumn = i % cols
  const currentRow = Math.floor(i / cols)
  const colSide: string[] = []
  const rowSide: string[] = []
  if (currentColumn === 0) colSide.push('0')
  else for (let j = 0; j < currentColumn; j++) colSide.push('w0')
  if (currentRow === 0) rowSide.push('0')
  else for (let k = 0; k < currentRow; k++) rowSide.push('h0')
  return `${colSide.join('+')}_${rowSide.join('+')}`
}

/** Mid-slice timestamps (HH:MM:SS) for evenly sampling `tileCount` frames. */
export function planGridTileTimestamps(durationSec: number, tileCount: number): {
  durSlice: number
  timestamps: string[]
} {
  const durSlice = Number.parseInt(String(durationSec / tileCount), 10)
  const timestamps: string[] = []
  for (let i = 0; i < tileCount; i++) {
    timestamps.push(
      new Date(1000 * (i + 0.5) * durSlice).toISOString().substr(11, 8),
    )
  }
  return {durSlice, timestamps}
}

/**
 * Seek seconds for a contact-sheet tile — same mid-slice formula as
 * `planGridTileTimestamps` / ffmpeg grid generation.
 */
export function gridTileSeekSeconds(
  durationSec: number,
  tileIndex: number,
  tileCount = VIDEO_GRID_SPRITE.cols * VIDEO_GRID_SPRITE.rows,
): number | null {
  const duration = Number(durationSec)
  const index = Math.floor(Number(tileIndex))
  const count = Math.floor(Number(tileCount))
  if (!Number.isFinite(duration) || duration <= 0) return null
  if (!Number.isFinite(index) || index < 0 || !Number.isFinite(count) || count <= 0 || index >= count) {
    return null
  }
  // Match ffmpeg grid mid-slice sampling (integer slice width).
  const durSlice = Number.parseInt(String(duration / count), 10)
  if (!Number.isFinite(durSlice) || durSlice < 0) return null
  const raw = (index + 0.5) * durSlice
  if (!Number.isFinite(raw) || raw < 0) return null
  // Never seek past EOF — stale/wrong DB duration or last-tile rounding can overshoot.
  const maxSeek = Math.max(0, duration - 0.05)
  return Math.min(raw, maxSeek)
}

/** Paths, stream labels, and xstack layouts for combining tile PNGs. */
export function buildGridCombineInputs(
  tmpDir: string,
  tileCount: number,
  cols: number,
  joinPath: (dir: string, name: string) => string = (dir, name) => `${dir}/${name}`,
): {inputFiles: string[]; streams: string[]; layouts: string[]} {
  const inputFiles: string[] = []
  const streams: string[] = []
  const layouts: string[] = []
  for (let l = 0; l < tileCount; l++) {
    inputFiles.push(joinPath(tmpDir, `thumb${l}.png`))
    streams.push(`[${l}:v]`)
    layouts.push(makeXstackLayout(l, cols))
  }
  return {inputFiles, streams, layouts}
}
