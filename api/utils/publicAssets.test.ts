import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, describe, expect, it} from 'vitest'
import {resolveBundledPublicFile} from './publicAssets'

describe('resolveBundledPublicFile', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, {recursive: true, force: true})
    }
  })

  it('resolves shipped unavailable.png from public/', () => {
    const resolved = resolveBundledPublicFile('/images/unavailable.png')
    expect(resolved).toBeTruthy()
    expect(resolved?.endsWith(`${path.sep}images${path.sep}unavailable.png`)).toBe(true)
    expect(fs.existsSync(resolved!)).toBe(true)
  })

  it('rejects path traversal and non-asset folders', () => {
    expect(resolveBundledPublicFile('/images/../package.json')).toBeNull()
    expect(resolveBundledPublicFile('/api/secret')).toBeNull()
    expect(resolveBundledPublicFile('images/unavailable.png')).toBeNull()
  })

  it('finds files under cwd/public when present', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'public-assets-'))
    tempDirs.push(root)
    const previous = process.cwd()
    try {
      process.chdir(root)
      fs.mkdirSync(path.join(root, 'public', 'images'), {recursive: true})
      const publicFile = path.join(root, 'public', 'images', 'demo2.png')
      fs.writeFileSync(publicFile, 'y')
      const resolved = resolveBundledPublicFile('/images/demo2.png')
      expect(resolved).toBeTruthy()
      expect(fs.realpathSync(resolved!)).toBe(fs.realpathSync(publicFile))
    } finally {
      process.chdir(previous)
    }
  })
})
