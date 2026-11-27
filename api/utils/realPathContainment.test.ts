import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {isRealPathInside, resolveGeneratedImageOutput} from './realPathContainment'

describe('realPathContainment', () => {
  let tmp: string
  let data: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-contain-'))
    data = path.join(tmp, 'data')
    fs.mkdirSync(data)
  })
  afterEach(() => fs.rmSync(tmp, {recursive: true, force: true}))

  it('accepts image outputs inside the data folder, including missing parents', () => {
    const out = path.join(data, 'media', 'videos', 'thumbs', '1.jpg')
    expect(resolveGeneratedImageOutput(out, data)).toBe(out)
  })

  it('rejects paths outside the data folder, traversal, relative and non-image names', () => {
    expect(resolveGeneratedImageOutput(path.join(tmp, 'evil.jpg'), data)).toBeNull()
    expect(resolveGeneratedImageOutput(path.join(data, '..', 'evil.jpg'), data)).toBeNull()
    expect(resolveGeneratedImageOutput('thumbs/1.jpg', data)).toBeNull()
    expect(resolveGeneratedImageOutput(path.join(data, 'config.json'), data)).toBeNull()
    expect(resolveGeneratedImageOutput(path.join(data, 'a.jpg'), undefined)).toBeNull()
  })

  it('rejects symlink escapes', () => {
    const outside = path.join(tmp, 'outside')
    fs.mkdirSync(outside)
    fs.symlinkSync(outside, path.join(data, 'link'))
    expect(isRealPathInside(data, path.join(data, 'link', 'x.jpg'))).toBe(false)
    expect(resolveGeneratedImageOutput(path.join(data, 'link', 'x.jpg'), data)).toBeNull()
  })
})
