import {describe, expect, it, afterEach} from 'vitest'
import path from 'path'
import {getProjectRoot, projectPath, resetProjectRootCache} from './projectRoot'

describe('projectRoot', () => {
  afterEach(() => {
    resetProjectRootCache()
  })

  it('resolves from shared/ to the package root', () => {
    const root = getProjectRoot(__dirname)
    expect(path.basename(root)).toBe('mediaChips')
    expect(projectPath('package.json')).toBe(path.join(root, 'package.json'))
  })

  it('skips tsc outDirs that contain a copied package.json', () => {
    const nested = path.join(__dirname, '..', '.backend-build', 'shared')
    const root = getProjectRoot(nested)
    expect(root).toBe(path.join(__dirname, '..'))
    expect(path.basename(root)).not.toBe('.backend-build')
  })
})
