import { Jimp } from 'jimp'
import { VIDEO_GRID_SPRITE } from '../../shared/videoPreview'
import {
  averageHashFromBitmap,
  bitsToHex,
  type VisualFingerprint,
  type VisualHashHex,
} from './visualHashSimilarity'

export type {
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
} from './visualHashSimilarity'

type JimpLike = {
  clone: () => {
    resize: (opts: {w: number, h: number}) => {
      greyscale: () => {
        bitmap: {data: Buffer, width: number, height: number}
      }
    }
  }
}

/** Average-hash (aHash) of an image → 16-char hex. */
export async function computeAHashHex(imagePath: string): Promise<VisualHashHex> {
  const image = await Jimp.read(imagePath)
  const tiny = image.clone().resize({w: 8, h: 8}).greyscale()
  const {data, width, height} = tiny.bitmap
  return bitsToHex(averageHashFromBitmap(data, width, height))
}

async function computeAHashHexFromImage(image: JimpLike): Promise<VisualHashHex> {
  const tiny = image.clone().resize({w: 8, h: 8}).greyscale()
  const {data, width, height} = tiny.bitmap
  return bitsToHex(averageHashFromBitmap(data, width, height))
}

/**
 * Fingerprint a contact-sheet / grid JPEG: whole-image aHash + 3×3 tile aHashes.
 */
export async function computeGridVisualFingerprint(
  gridPath: string,
  cols = VIDEO_GRID_SPRITE.cols,
  rows = VIDEO_GRID_SPRITE.rows,
): Promise<VisualFingerprint> {
  const image = await Jimp.read(gridPath)
  const hash = await computeAHashHexFromImage(image)

  const tileW = Math.floor(image.bitmap.width / cols)
  const tileH = Math.floor(image.bitmap.height / rows)
  const tiles: VisualHashHex[] = []

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const tile = image.clone().crop({
        x: col * tileW,
        y: row * tileH,
        w: tileW,
        h: tileH,
      })
      tiles.push(await computeAHashHexFromImage(tile as unknown as JimpLike))
    }
  }

  return {hash, tiles}
}
