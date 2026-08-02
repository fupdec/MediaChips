import { Jimp } from 'jimp'
import { VIDEO_GRID_SPRITE } from '../../shared/videoPreview'

/** 64-bit average hash as hex (16 chars). */
export type VisualHashHex = string

export interface VisualFingerprint {
  /** aHash of the full 3×3 grid image. */
  hash: VisualHashHex
  /** Per-tile aHashes in row-major order (9 entries for a standard grid). */
  tiles: VisualHashHex[]
}

export interface VisualSimilarityOptions {
  /** Max Hamming distance on the full-grid hash to treat as similar. */
  maxGridDistance?: number
  /** Max Hamming distance for a single tile to count as a match. */
  maxTileDistance?: number
  /** Minimum matching tiles (of 9) to treat as similar when grid hash diverges. */
  minTileMatches?: number
}

export interface VisualHashRow {
  id: number
  visualHash: string
  visualHashTiles?: string | null
}

export interface VisualDuplicateCluster {
  ids: number[]
  hash: string
}

export const DEFAULT_VISUAL_SIMILARITY: Required<VisualSimilarityOptions> = {
  maxGridDistance: 10,
  maxTileDistance: 8,
  minTileMatches: 6,
}

const HASH_BITS = 64
const HEX_LEN = HASH_BITS / 4

function bitsToHex(bits: string): VisualHashHex {
  let hex = ''
  for (let i = 0; i < bits.length; i += 4) {
    hex += Number.parseInt(bits.slice(i, i + 4).padEnd(4, '0'), 2).toString(16)
  }
  return hex.padStart(HEX_LEN, '0').slice(0, HEX_LEN)
}

function hexToBits(hex: string): string {
  const normalized = String(hex || '').trim().toLowerCase()
  if (!/^[0-9a-f]+$/.test(normalized)) return ''
  return normalized
    .split('')
    .map((ch) => Number.parseInt(ch, 16).toString(2).padStart(4, '0'))
    .join('')
}

function averageHashFromBitmap(data: Buffer, width: number, height: number): string {
  const values: number[] = []
  let sum = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = data[(y * width + x) * 4]
      values.push(v)
      sum += v
    }
  }
  const avg = sum / Math.max(values.length, 1)
  return values.map((v) => (v >= avg ? '1' : '0')).join('')
}

/** Average-hash (aHash) of an image → 16-char hex. */
export async function computeAHashHex(imagePath: string): Promise<VisualHashHex> {
  const image = await Jimp.read(imagePath)
  const tiny = image.clone().resize({w: 8, h: 8}).greyscale()
  const {data, width, height} = tiny.bitmap
  return bitsToHex(averageHashFromBitmap(data, width, height))
}

type JimpLike = {
  clone: () => {
    resize: (opts: {w: number, h: number}) => {
      greyscale: () => {
        bitmap: {data: Buffer, width: number, height: number}
      }
    }
  }
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

export function encodeVisualHashTiles(tiles: VisualHashHex[]): string {
  return tiles.join(':')
}

export function decodeVisualHashTiles(value: string | null | undefined): VisualHashHex[] {
  const raw = String(value || '').trim()
  if (!raw) return []
  return raw.split(':').map((part) => part.trim().toLowerCase()).filter(Boolean)
}

export function hammingDistanceHex(a: string, b: string): number {
  const bitsA = hexToBits(a)
  const bitsB = hexToBits(b)
  if (!bitsA || !bitsB) return HASH_BITS
  const n = Math.min(bitsA.length, bitsB.length)
  let d = 0
  for (let i = 0; i < n; i++) {
    if (bitsA[i] !== bitsB[i]) d += 1
  }
  return d + Math.abs(bitsA.length - bitsB.length)
}

export function countMatchingTiles(
  tilesA: VisualHashHex[],
  tilesB: VisualHashHex[],
  maxTileDistance: number,
): number {
  const n = Math.min(tilesA.length, tilesB.length)
  let matches = 0
  for (let i = 0; i < n; i++) {
    if (hammingDistanceHex(tilesA[i], tilesB[i]) <= maxTileDistance) {
      matches += 1
    }
  }
  return matches
}

export function areVisuallySimilar(
  a: Pick<VisualFingerprint, 'hash' | 'tiles'>,
  b: Pick<VisualFingerprint, 'hash' | 'tiles'>,
  options: VisualSimilarityOptions = {},
): boolean {
  const opts = {...DEFAULT_VISUAL_SIMILARITY, ...options}
  if (hammingDistanceHex(a.hash, b.hash) <= opts.maxGridDistance) return true
  if (!a.tiles.length || !b.tiles.length) return false
  return countMatchingTiles(a.tiles, b.tiles, opts.maxTileDistance) >= opts.minTileMatches
}

function fingerprintFromRow(row: VisualHashRow): VisualFingerprint {
  return {
    hash: String(row.visualHash || '').trim().toLowerCase(),
    tiles: decodeVisualHashTiles(row.visualHashTiles),
  }
}

/**
 * Union-find clustering of media rows that look similar by grid aHash / tiles.
 * Returns only clusters with 2+ members.
 */
export function clusterVisualNearDuplicates(
  rows: VisualHashRow[],
  options: VisualSimilarityOptions = {},
): VisualDuplicateCluster[] {
  const items = rows
    .map((row) => ({
      id: Number(row.id),
      fp: fingerprintFromRow(row),
    }))
    .filter((row) => Boolean(row.fp.hash) && row.id > 0)

  const parent = new Map<number, number>()
  const find = (id: number): number => {
    let root = id
    while (parent.get(root) !== root) {
      root = parent.get(root) ?? root
    }
    let cur = id
    while (cur !== root) {
      const next = parent.get(cur) ?? cur
      parent.set(cur, root)
      cur = next
    }
    return root
  }
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }

  for (const item of items) parent.set(item.id, item.id)

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (areVisuallySimilar(items[i].fp, items[j].fp, options)) {
        union(items[i].id, items[j].id)
      }
    }
  }

  const groups = new Map<number, number[]>()
  for (const item of items) {
    const root = find(item.id)
    const list = groups.get(root) || []
    list.push(item.id)
    groups.set(root, list)
  }

  const clusters: VisualDuplicateCluster[] = []
  for (const ids of groups.values()) {
    if (ids.length < 2) continue
    ids.sort((a, b) => a - b)
    const lead = items.find((item) => item.id === ids[0])
    clusters.push({ids, hash: lead?.fp.hash || ''})
  }

  clusters.sort((a, b) => a.ids[0] - b.ids[0])
  return clusters
}

/** Flat list of media IDs that belong to any near-duplicate cluster. */
export function flattenVisualDuplicateIds(clusters: VisualDuplicateCluster[]): number[] {
  const ids = new Set<number>()
  for (const cluster of clusters) {
    for (const id of cluster.ids) ids.add(id)
  }
  return [...ids].sort((a, b) => a - b)
}
