import { VIDEO_GRID_SPRITE } from '../../shared/videoPreview'
import {averageHashFromLumaValues} from './faceDetectorMath'
import {
  bitsToHex,
  type VisualFingerprint,
  type VisualHashHex,
} from './visualHashSimilarity'

export type {
  RankVisualSimilarOptions,
  VisualDuplicateCluster,
  VisualFingerprint,
  VisualHashHex,
  VisualHashRow,
  VisualSimilarityOptions,
} from './visualHashSimilarity'

export {
  DEFAULT_VISUAL_SIMILARITY,
  areVisuallySimilar,
  averageHashFromBitmap,
  clusterVisualNearDuplicates,
  countMatchingTiles,
  decodeVisualHashTiles,
  encodeVisualHashTiles,
  flattenVisualDuplicateIds,
  hammingDistanceHex,
  rankVisualSimilarIds,
} from './visualHashSimilarity'

async function getSharp() {
  const {default: sharp} = await import('sharp')
  return sharp
}

/** Nearest-neighbor 8×8 keeps high-frequency structure that aHash needs. */
const AHASH_RESIZE = {fit: 'fill' as const, kernel: 'nearest' as const}

function aHashHexFromRawGrey(
  data: Buffer,
  channels: number,
): VisualHashHex {
  const values: number[] = []
  for (let i = 0; i < data.length; i += Math.max(1, channels)) {
    values.push(data[i])
  }
  return bitsToHex(averageHashFromLumaValues(values))
}

/** Average-hash (aHash) of an image → 16-char hex. */
export async function computeAHashHex(imagePath: string): Promise<VisualHashHex> {
  const sharp = await getSharp()
  const {data, info} = await sharp(imagePath)
    .resize(8, 8, AHASH_RESIZE)
    .greyscale()
    .raw()
    .toBuffer({resolveWithObject: true})
  return aHashHexFromRawGrey(data, info.channels)
}

async function computeAHashHexFromRgba(
  data: Buffer,
  width: number,
  height: number,
): Promise<VisualHashHex> {
  const sharp = await getSharp()
  const {data: tiny, info} = await sharp(data, {
    raw: {width, height, channels: 4},
  })
    .resize(8, 8, AHASH_RESIZE)
    .greyscale()
    .raw()
    .toBuffer({resolveWithObject: true})
  return aHashHexFromRawGrey(tiny, info.channels)
}

/**
 * Fingerprint a contact-sheet / grid JPEG: whole-image aHash + 3×3 tile aHashes.
 */
export async function computeGridVisualFingerprint(
  gridPath: string,
  cols = VIDEO_GRID_SPRITE.cols,
  rows = VIDEO_GRID_SPRITE.rows,
): Promise<VisualFingerprint> {
  const sharp = await getSharp()
  const {data, info} = await sharp(gridPath)
    .ensureAlpha()
    .raw()
    .toBuffer({resolveWithObject: true})

  const hash = await computeAHashHexFromRgba(data, info.width, info.height)

  const tileW = Math.floor(info.width / cols)
  const tileH = Math.floor(info.height / rows)
  const tiles: VisualHashHex[] = []

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const {data: tiny, info: tinyInfo} = await sharp(data, {
        raw: {width: info.width, height: info.height, channels: 4},
      })
        .extract({
          left: col * tileW,
          top: row * tileH,
          width: tileW,
          height: tileH,
        })
        .resize(8, 8, AHASH_RESIZE)
        .greyscale()
        .raw()
        .toBuffer({resolveWithObject: true})
      tiles.push(aHashHexFromRawGrey(tiny, tinyInfo.channels))
    }
  }

  return {hash, tiles}
}
