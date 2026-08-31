import {describe, expect, it, afterEach} from 'vitest'
import fs from 'fs'
import path from 'path'
import {getProjectRoot, projectPath, resetProjectRootCache} from './projectRoot'

describe('projectRoot', () => {
  afterEach(() => {
    resetProjectRootCache()
  })

  it('resolves from shared/ to the package root', () => {
    const root = getProjectRoot(__dirname)
    // The checkout directory may differ by casing (mediaChips vs MediaChips), so
    // assert on the package name instead of the directory basename.
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    expect(pkg.name).toBe('mediachips')
    expect(projectPath('package.json')).toBe(path.join(root, 'package.json'))
  })

  it('skips tsc outDirs that contain a copied package.json', () => {
    const nested = path.join(__dirname, '..', '.backend-build', 'shared')
    const root = getProjectRoot(nested)
    expect(root).toBe(path.join(__dirname, '..'))
    expect(path.basename(root)).not.toBe('.backend-build')
  })
})
