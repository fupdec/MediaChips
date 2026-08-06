import {describe, expect, it} from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {Jimp} from 'jimp'
import {
  areVisuallySimilar,
  clusterVisualNearDuplicates,
  computeGridVisualFingerprint,
  countMatchingTiles,
  decodeVisualHashTiles,
  encodeVisualHashTiles,
  flattenVisualDuplicateIds,
  hammingDistanceHex,
} from './visualHash'

async function writeCheckerGrid(filePath: string, tileSize = 32) {
  const cols = 3
  const rows = 3
  const image = new Jimp({
    width: tileSize * cols,
    height: tileSize * rows,
    color: 0xffffffff,
  })

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const shade = ((row + col) % 2 === 0) ? 0x000000ff : 0xffffffff
      for (let y = 0; y < tileSize; y++) {
        for (let x = 0; x < tileSize; x++) {
          image.setPixelColor(shade, col * tileSize + x, row * tileSize + y)
        }
      }
    }
  }

  await image.write(filePath as `${string}.${string}`)
}

async function writeStripeGrid(filePath: string, vertical: boolean, tileSize = 32) {
  const cols = 3
  const rows = 3
  const image = new Jimp({
    width: tileSize * cols,
    height: tileSize * rows,
    color: 0xffffffff,
  })

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      for (let y = 0; y < tileSize; y++) {
        for (let x = 0; x < tileSize; x++) {
          const band = vertical ? Math.floor(x / 4) : Math.floor(y / 4)
          const shade = band % 2 === 0 ? 0x000000ff : 0xffffffff
          image.setPixelColor(shade, col * tileSize + x, row * tileSize + y)
        }
      }
    }
  }

  await image.write(filePath as `${string}.${string}`)
}

describe('visualHash', () => {
  it('encodes and decodes tile hashes', () => {
    const tiles = ['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb']
    expect(decodeVisualHashTiles(encodeVisualHashTiles(tiles))).toEqual(tiles)
  })

  it('reports zero Hamming distance for identical hashes', () => {
    expect(hammingDistanceHex('ffffffffffffffff', 'ffffffffffffffff')).toBe(0)
  })

  it('reports full distance for inverted 64-bit hashes', () => {
    expect(hammingDistanceHex('ffffffffffffffff', '0000000000000000')).toBe(64)
  })

  it('fingerprints identical grids as similar', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-visual-hash-'))
    const aPath = path.join(dir, 'a.jpg')
    const bPath = path.join(dir, 'b.jpg')
    await writeCheckerGrid(aPath)
    await writeCheckerGrid(bPath)

    const a = await computeGridVisualFingerprint(aPath)
    const b = await computeGridVisualFingerprint(bPath)

    expect(a.hash).toHaveLength(16)
    expect(a.tiles).toHaveLength(9)
    expect(a.hash).toBe(b.hash)
    expect(areVisuallySimilar(a, b)).toBe(true)
    expect(countMatchingTiles(a.tiles, b.tiles, 0)).toBe(9)
  })

  it('treats very different grids as dissimilar', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-visual-hash-'))
    const aPath = path.join(dir, 'a.jpg')
    const bPath = path.join(dir, 'b.jpg')
    await writeStripeGrid(aPath, true)
    await writeStripeGrid(bPath, false)

    const a = await computeGridVisualFingerprint(aPath)
    const b = await computeGridVisualFingerprint(bPath)

    expect(areVisuallySimilar(a, b, {
      maxGridDistance: 8,
      maxTileDistance: 4,
      minTileMatches: 6,
    })).toBe(false)
  })

  it('clusters near-duplicate rows and ignores singles', () => {
    const clusters = clusterVisualNearDuplicates([
      {id: 1, visualHash: 'ffffffffffffffff', visualHashTiles: null},
      {id: 2, visualHash: 'fffffffffffffffe', visualHashTiles: null},
      {id: 3, visualHash: '0000000000000000', visualHashTiles: null},
      {id: 4, visualHash: 'fffffffffffffffd', visualHashTiles: null},
    ], {maxGridDistance: 2})

    expect(clusters).toHaveLength(1)
    expect(clusters[0].ids).toEqual([1, 2, 4])
    expect(flattenVisualDuplicateIds(clusters)).toEqual([1, 2, 4])
  })

  it('clusters tile-near duplicates even when grid hashes diverge', () => {
    const sharedTiles = Array.from({length: 9}, () => 'aaaaaaaaaaaaaaaa').join(':')
    const clusters = clusterVisualNearDuplicates([
      {
        id: 10,
        visualHash: 'ffffffffffffffff',
        visualHashTiles: sharedTiles,
      },
      {
        id: 11,
        // Far from fff... in Hamming space, but tiles match.
        visualHash: '0000000000000000',
        visualHashTiles: sharedTiles,
      },
      {
        id: 12,
        visualHash: '0f0f0f0f0f0f0f0f',
        visualHashTiles: Array.from({length: 9}, () => 'bbbbbbbbbbbbbbbb').join(':'),
      },
    ], {
      maxGridDistance: 2,
      maxTileDistance: 0,
      minTileMatches: 6,
    })

    expect(clusters).toHaveLength(1)
    expect(clusters[0].ids).toEqual([10, 11])
  })

  it('clusters a large synthetic set without timing out', () => {
    const rows = []
    for (let i = 1; i <= 1200; i++) {
      // Unique-ish hashes so BK-tree stays selective; sprinkle near-dup pairs.
      const base = (BigInt(i) * 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn
      const hex = base.toString(16).padStart(16, '0')
      rows.push({id: i, visualHash: hex, visualHashTiles: null})
      if (i % 40 === 0) {
        // Flip one bit → distance 1 duplicate.
        const twin = (base ^ 1n).toString(16).padStart(16, '0')
        rows.push({id: i + 10_000, visualHash: twin, visualHashTiles: null})
      }
    }

    const started = Date.now()
    const clusters = clusterVisualNearDuplicates(rows, {maxGridDistance: 2})
    expect(Date.now() - started).toBeLessThan(3_000)
    expect(clusters.length).toBeGreaterThan(20)
    expect(clusters.every((cluster) => cluster.ids.length >= 2)).toBe(true)
  })
})
