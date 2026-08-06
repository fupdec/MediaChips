/** Pure visual-hash encode/compare/cluster helpers (no Jimp). */

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

export function bitsToHex(bits: string): VisualHashHex {
  let hex = ''
  for (let i = 0; i < bits.length; i += 4) {
    hex += Number.parseInt(bits.slice(i, i + 4).padEnd(4, '0'), 2).toString(16)
  }
  return hex.padStart(HEX_LEN, '0').slice(0, HEX_LEN)
}

/** Average-hash bits from RGBA bitmap data (uses R channel). */
export function averageHashFromBitmap(
  data: Buffer | Uint8Array | number[],
  width: number,
  height: number,
): string {
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

export function hexToBits(hex: string): string {
  const normalized = String(hex || '').trim().toLowerCase()
  if (!/^[0-9a-f]+$/.test(normalized)) return ''
  return normalized
    .split('')
    .map((ch) => Number.parseInt(ch, 16).toString(2).padStart(4, '0'))
    .join('')
}

export function encodeVisualHashTiles(tiles: VisualHashHex[]): string {
  return tiles.join(':')
}

export function decodeVisualHashTiles(value: string | null | undefined): VisualHashHex[] {
  const raw = String(value || '').trim()
  if (!raw) return []
  return raw.split(':').map((part) => part.trim().toLowerCase()).filter(Boolean)
}

function popcountBigInt(value: bigint): number {
  let x = value
  let count = 0
  while (x > 0n) {
    x &= x - 1n
    count += 1
  }
  return count
}

/** Parse a ≤16-char hex aHash to bigint; invalid input → null. */
export function hexToHashBigInt(hex: string): bigint | null {
  const normalized = String(hex || '').trim().toLowerCase()
  if (!normalized || !/^[0-9a-f]+$/.test(normalized)) return null
  if (normalized.length > HEX_LEN) return null
  return BigInt(`0x${normalized.padStart(HEX_LEN, '0')}`)
}

export function hammingDistanceHex(a: string, b: string): number {
  const ia = hexToHashBigInt(a)
  const ib = hexToHashBigInt(b)
  if (ia == null || ib == null) {
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
  return popcountBigInt(ia ^ ib)
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

export type RankVisualSimilarOptions = VisualSimilarityOptions & {
  /** Max neighbors to return (seed is always prepended and not counted). */
  limit?: number
}

/**
 * Rank rows visually similar to seed by grid Hamming distance.
 * Returns [seedId, ...neighborIds] (seed first). Empty when seed has no hash.
 */
export function rankVisualSimilarIds(
  seed: VisualHashRow,
  rows: VisualHashRow[],
  options: RankVisualSimilarOptions = {},
): number[] {
  const {limit = 50, ...similarity} = options
  const seedId = Number(seed.id)
  if (!Number.isFinite(seedId) || seedId <= 0) return []

  const seedFp = fingerprintFromRow(seed)
  if (!seedFp.hash) return []

  const scored: Array<{id: number, distance: number}> = []
  for (const row of rows) {
    const id = Number(row.id)
    if (!Number.isFinite(id) || id <= 0 || id === seedId) continue
    const fp = fingerprintFromRow(row)
    if (!fp.hash) continue
    if (!areVisuallySimilar(seedFp, fp, similarity)) continue
    scored.push({id, distance: hammingDistanceHex(seedFp.hash, fp.hash)})
  }

  scored.sort((a, b) => a.distance - b.distance || a.id - b.id)
  const neighborLimit = Math.max(0, Number(limit) || 0)
  return [seedId, ...scored.slice(0, neighborLimit).map((entry) => entry.id)]
}

/** BK search radius used for near-dup candidates (grid + near-grid tile path). */
export function visualSimilarBkRadius(options: VisualSimilarityOptions = {}): number {
  const opts = {...DEFAULT_VISUAL_SIMILARITY, ...options}
  return Math.max(opts.maxGridDistance, Math.min(20, opts.maxGridDistance + 8))
}

/**
 * Collect media ids whose grid aHash is within the BK near-dup radius of seed.
 * Operates on lean rows (hash only) so callers can avoid loading tiles for the
 * full media type, then hydrate tiles only for these candidates.
 */
export function collectVisualNearNeighborIds(
  seed: Pick<VisualHashRow, 'id' | 'visualHash'>,
  leanRows: Array<Pick<VisualHashRow, 'id' | 'visualHash'>>,
  options: VisualSimilarityOptions = {},
): number[] {
  const seedId = Number(seed.id)
  const seedHash = String(seed.visualHash || '').trim().toLowerCase()
  if (!Number.isFinite(seedId) || seedId <= 0 || !seedHash) return []

  const items: ClusterItem[] = []
  let seedIndex = -1

  const pushItem = (id: number, hash: string) => {
    const fp = {hash, tiles: [] as VisualHashHex[]}
    const index = items.length
    items.push({id, fp, hashInt: hexToHashBigInt(hash)})
    if (id === seedId) seedIndex = index
  }

  pushItem(seedId, seedHash)
  for (const row of leanRows) {
    const id = Number(row.id)
    if (!Number.isFinite(id) || id <= 0 || id === seedId) continue
    const hash = String(row.visualHash || '').trim().toLowerCase()
    if (!hash) continue
    pushItem(id, hash)
  }

  if (items.length <= 1) return []

  const radius = visualSimilarBkRadius(options)
  let bkRoot: BKNode | null = null
  for (let i = 0; i < items.length; i += 1) {
    if (i === seedIndex) continue
    bkRoot = bkInsert(bkRoot, i, items)
  }

  const hitIndexes: number[] = []
  bkQuery(bkRoot, seedIndex, radius, items, hitIndexes)
  return hitIndexes.map((index) => items[index].id)
}

type ClusterItem = {
  id: number
  fp: VisualFingerprint
  hashInt: bigint | null
}

type BKNode = {
  index: number
  children: Map<number, BKNode>
}

function gridDistance(items: ClusterItem[], i: number, j: number): number {
  const a = items[i].hashInt
  const b = items[j].hashInt
  if (a == null || b == null) {
    return hammingDistanceHex(items[i].fp.hash, items[j].fp.hash)
  }
  return popcountBigInt(a ^ b)
}

function bkInsert(
  root: BKNode | null,
  index: number,
  items: ClusterItem[],
): BKNode {
  if (!root) return {index, children: new Map()}
  let node = root
  while (true) {
    const distance = gridDistance(items, node.index, index)
    const child = node.children.get(distance)
    if (!child) {
      node.children.set(distance, {index, children: new Map()})
      return root
    }
    node = child
  }
}

function bkQuery(
  root: BKNode | null,
  target: number,
  maxDistance: number,
  items: ClusterItem[],
  out: number[],
): void {
  if (!root) return
  const distance = gridDistance(items, root.index, target)
  if (distance <= maxDistance) out.push(root.index)

  for (const [edge, child] of root.children) {
    if (edge >= distance - maxDistance && edge <= distance + maxDistance) {
      bkQuery(child, target, maxDistance, items, out)
    }
  }
}

/**
 * Tile-band candidates: 16×4-bit nibbles per tile.
 * For tile Hamming ≤ maxTileDistance (default 8), at least one nibble matches
 * when there are 16 bands (pigeonhole), so recall stays high without n².
 */
function collectTileBandCandidates(
  items: ClusterItem[],
  index: number,
  buckets: Map<string, number[]>,
): number[] {
  const tiles = items[index].fp.tiles
  if (!tiles.length) return []

  const seen = new Set<number>()
  const out: number[] = []
  for (let tileIndex = 0; tileIndex < tiles.length; tileIndex++) {
    const tile = tiles[tileIndex]
    if (tile.length < HEX_LEN) continue
    for (let band = 0; band < HEX_LEN; band++) {
      const key = `${tileIndex}:${band}:${tile[band]}`
      const bucket = buckets.get(key)
      if (!bucket) continue
      for (const other of bucket) {
        if (other >= index || seen.has(other)) continue
        seen.add(other)
        out.push(other)
      }
    }
  }
  return out
}

function indexTileBands(items: ClusterItem[]): Map<string, number[]> {
  const buckets = new Map<string, number[]>()
  for (let index = 0; index < items.length; index++) {
    const tiles = items[index].fp.tiles
    for (let tileIndex = 0; tileIndex < tiles.length; tileIndex++) {
      const tile = tiles[tileIndex]
      if (tile.length < HEX_LEN) continue
      for (let band = 0; band < HEX_LEN; band++) {
        const key = `${tileIndex}:${band}:${tile[band]}`
        const list = buckets.get(key)
        if (list) list.push(index)
        else buckets.set(key, [index])
      }
    }
  }
  return buckets
}

/**
 * Union-find clustering of media rows that look similar by grid aHash / tiles.
 * Uses a BK-tree on grid hashes (plus tile-band candidates) instead of O(n²) pairs.
 * Returns only clusters with 2+ members.
 */
export function clusterVisualNearDuplicates(
  rows: VisualHashRow[],
  options: VisualSimilarityOptions = {},
): VisualDuplicateCluster[] {
  const opts = {...DEFAULT_VISUAL_SIMILARITY, ...options}
  const items: ClusterItem[] = rows
    .map((row) => {
      const fp = fingerprintFromRow(row)
      return {
        id: Number(row.id),
        fp,
        hashInt: hexToHashBigInt(fp.hash),
      }
    })
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

  // Slightly wider than grid threshold so moderately drifted hashes still become
  // candidates for the tile-overlap path inside areVisuallySimilar.
  const bkRadius = Math.max(opts.maxGridDistance, Math.min(20, opts.maxGridDistance + 8))
  let bkRoot: BKNode | null = null
  const tileBuckets = indexTileBands(items)

  for (let i = 0; i < items.length; i++) {
    const candidates = new Set<number>()
    const bkHits: number[] = []
    bkQuery(bkRoot, i, bkRadius, items, bkHits)
    for (const j of bkHits) candidates.add(j)
    for (const j of collectTileBandCandidates(items, i, tileBuckets)) {
      candidates.add(j)
    }

    for (const j of candidates) {
      if (areVisuallySimilar(items[i].fp, items[j].fp, opts)) {
        union(items[i].id, items[j].id)
      }
    }
    bkRoot = bkInsert(bkRoot, i, items)
  }

  const groups = new Map<number, number[]>()
  for (const item of items) {
    const root = find(item.id)
    const list = groups.get(root) || []
    list.push(item.id)
    groups.set(root, list)
  }

  const byId = new Map(items.map((item) => [item.id, item]))
  const clusters: VisualDuplicateCluster[] = []
  for (const ids of groups.values()) {
    if (ids.length < 2) continue
    ids.sort((a, b) => a - b)
    const lead = byId.get(ids[0])
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
