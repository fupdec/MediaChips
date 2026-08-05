import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, describe, expect, it} from 'vitest'
import {
  cleanupDir,
  ensureDir,
  FACE_CROPS_RELATIVE_ROOT,
  getFacesDir,
  relativeFaceCropPath,
} from './faceCropStore'

const tmpRoots: string[] = []

afterEach(() => {
  for (const root of tmpRoots.splice(0)) {
    cleanupDir(root)
  }
})

describe('faceCropStore paths', () => {
  it('builds absolute and relative crop locations', () => {
    expect(getFacesDir('/db', 42)).toBe(path.join('/db', FACE_CROPS_RELATIVE_ROOT, '42'))
    expect(relativeFaceCropPath(7, 'face_001.jpg')).toBe(
      path.join(FACE_CROPS_RELATIVE_ROOT, '7', 'face_001.jpg'),
    )
  })

  it('ensures and cleans directories', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mediachips-crop-store-'))
    tmpRoots.push(root)
    const nested = path.join(root, 'a', 'b')
    ensureDir(nested)
    expect(fs.existsSync(nested)).toBe(true)
    fs.writeFileSync(path.join(nested, 'x.txt'), 'ok')
    cleanupDir(root)
    expect(fs.existsSync(root)).toBe(false)
  })

  it('cleanupDir no-ops on null/missing paths', () => {
    expect(() => cleanupDir(null)).not.toThrow()
    expect(() => cleanupDir(path.join(os.tmpdir(), `missing-${Date.now()}`))).not.toThrow()
  })
})
