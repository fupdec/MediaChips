import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, describe, expect, it} from 'vitest'
import {
  collectExistingEmbeddings,
  filterPendingEnrollmentPaths,
  findTagImagePaths,
  orderFoundTagImages,
  resolveAbsoluteCropPath,
  toEnrollmentSourcePath,
} from './faceEnrollmentPaths'

describe('orderFoundTagImages', () => {
  it('puts preferred suffixes first and appends the rest', () => {
    const found = new Map([
      ['header', '/h.jpg'],
      ['main', '/m.jpg'],
      ['extra', '/e.jpg'],
      ['avatar', '/a.jpg'],
    ])
    expect(orderFoundTagImages(found)).toEqual(['/m.jpg', '/a.jpg', '/h.jpg', '/e.jpg'])
  })
})

describe('toEnrollmentSourcePath', () => {
  it('relativizes paths under the db root', () => {
    expect(toEnrollmentSourcePath('/db', '/db/meta/1/2_main.jpg')).toBe(
      path.join('meta', '1', '2_main.jpg'),
    )
  })

  it('keeps absolute paths outside the db root', () => {
    expect(toEnrollmentSourcePath('/db', '/other/face.jpg')).toBe('/other/face.jpg')
  })
})

describe('filterPendingEnrollmentPaths', () => {
  it('returns all paths when force is set', () => {
    expect(filterPendingEnrollmentPaths({
      imagePaths: ['/a.jpg', '/b.jpg'],
      existingSourcePaths: ['a.jpg'],
      dbPath: '/db',
      force: true,
    })).toEqual(['/a.jpg', '/b.jpg'])
  })

  it('skips already enrolled relative or absolute sources', () => {
    expect(filterPendingEnrollmentPaths({
      imagePaths: ['/db/meta/1.jpg', '/db/meta/2.jpg'],
      existingSourcePaths: [path.join('meta', '1.jpg')],
      dbPath: '/db',
    })).toEqual(['/db/meta/2.jpg'])
  })
})

describe('collectExistingEmbeddings', () => {
  it('skips corrupt rows', () => {
    const embeddings = collectExistingEmbeddings(
      [{embedding: '[1,0]'}, {embedding: 'nope'}, {embedding: null}],
      (value) => {
        if (value === 'nope') throw new Error('bad')
        return new Float32Array(JSON.parse(value))
      },
    )
    expect(embeddings).toHaveLength(1)
    expect(Array.from(embeddings[0])).toEqual([1, 0])
  })
})

describe('findTagImagePaths / resolveAbsoluteCropPath', () => {
  let tmpRoot = ''

  afterEach(() => {
    if (tmpRoot) fs.rmSync(tmpRoot, {recursive: true, force: true})
  })

  it('discovers and orders tag jpeg images', () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'face-enroll-'))
    const dir = path.join(tmpRoot, 'meta', '7')
    fs.mkdirSync(dir, {recursive: true})
    fs.writeFileSync(path.join(dir, '3_header.jpg'), 'x')
    fs.writeFileSync(path.join(dir, '3_main.jpg'), 'x')
    fs.writeFileSync(path.join(dir, '3_extra.jpg'), 'x')
    fs.writeFileSync(path.join(dir, '9_main.jpg'), 'x')

    expect(findTagImagePaths(tmpRoot, 7, 3)).toEqual([
      path.join(dir, '3_main.jpg'),
      path.join(dir, '3_header.jpg'),
      path.join(dir, '3_extra.jpg'),
    ])
  })

  it('resolves relative crop paths against the db root', () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'face-crop-'))
    const relative = path.join('faces', '1.jpg')
    const absolute = path.join(tmpRoot, relative)
    fs.mkdirSync(path.dirname(absolute), {recursive: true})
    fs.writeFileSync(absolute, 'x')

    expect(resolveAbsoluteCropPath(tmpRoot, relative)).toBe(absolute)
    expect(resolveAbsoluteCropPath(tmpRoot, 'missing.jpg')).toBeNull()
  })
})
