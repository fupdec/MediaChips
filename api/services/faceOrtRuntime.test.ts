import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, describe, expect, it} from 'vitest'
import {
  ensureCachedModelFile,
  getFaceModelCacheDir,
  resolveCachedModelPath,
} from './faceOrtRuntime'
import type {ApiDb} from '../types/db'

describe('faceOrtRuntime cache paths', () => {
  let tmpRoot = ''

  afterEach(() => {
    if (tmpRoot) fs.rmSync(tmpRoot, {recursive: true, force: true})
  })

  const makeDb = () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'face-ort-'))
    return {path_databases: tmpRoot} as ApiDb
  }

  it('builds model cache dirs under path_databases/models', () => {
    const db = makeDb()
    expect(getFaceModelCacheDir(db, 'scrfd')).toBe(path.join(tmpRoot, 'models', 'scrfd'))
  })

  it('resolves existing cached files only', () => {
    const db = makeDb()
    expect(resolveCachedModelPath(db, 'scrfd', 'det.onnx')).toBeNull()
    const dir = getFaceModelCacheDir(db, 'scrfd')
    fs.mkdirSync(dir, {recursive: true})
    const filePath = path.join(dir, 'det.onnx')
    fs.writeFileSync(filePath, 'x')
    expect(resolveCachedModelPath(db, 'scrfd', 'det.onnx')).toBe(filePath)
  })

  it('ensureCachedModelFile returns cached path without downloading', async () => {
    const db = makeDb()
    const dir = getFaceModelCacheDir(db, 'scrfd')
    fs.mkdirSync(dir, {recursive: true})
    const filePath = path.join(dir, 'det.onnx')
    fs.writeFileSync(filePath, 'cached')

    const result = await ensureCachedModelFile(db, {
      modelId: 'scrfd',
      filename: 'det.onnx',
      url: 'http://127.0.0.1:9/unreachable.onnx',
      errorLabel: 'face model',
    })

    expect(result).toEqual({path: filePath, downloaded: false})
  })
})
