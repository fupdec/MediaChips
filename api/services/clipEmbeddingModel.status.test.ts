/** @vitest-environment node */
import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, describe, expect, it} from 'vitest'
import {CLIP_REQUIRED_FILES} from '../../shared/manualModels'
import type {ApiDb} from '../types/db'
import {hasDownloadedClipModel} from './clipEmbeddingModel'
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, {recursive: true, force: true}) })
describe('CLIP readiness', () => {
  it('requires the complete model instead of any cached file', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clip-ready-'))
    roots.push(root)
    const db = {path_databases: root} as ApiDb
    const directory = path.join(root, 'models/Xenova/clip-vit-base-patch32')
    fs.mkdirSync(directory, {recursive: true})
    fs.writeFileSync(path.join(directory, 'config.json'), '{}')
    expect(hasDownloadedClipModel(db)).toBe(false)
    for (const file of CLIP_REQUIRED_FILES) {
      const target = path.join(directory, file)
      fs.mkdirSync(path.dirname(target), {recursive: true})
      fs.writeFileSync(target, 'contents')
    }
    expect(hasDownloadedClipModel(db)).toBe(true)
    fs.writeFileSync(path.join(directory, 'onnx/vision_model_quantized.onnx'), '')
    expect(hasDownloadedClipModel(db)).toBe(false)
  })
})
