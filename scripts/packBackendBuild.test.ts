import {describe, expect, it} from 'vitest'
import fs from 'fs'
import path from 'path'

const root = path.join(__dirname, '..')

describe('pack from .backend-build', () => {
  it('includes .backend-build in electron-builder files', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      build: {files: string[]}
    }
    const files = pkg.build.files
    expect(files).toContain('.backend-build/**/*')
    expect(files).not.toContain('!.backend-build')
  })

  it('dist verifies baked flags under .backend-build', () => {
    const dist = fs.readFileSync(path.join(root, 'scripts/dist.mjs'), 'utf8')
    expect(dist).toContain('.backend-build/shared/sfwCompiled.js')
    expect(dist).toContain('.backend-build/shared/msStoreCompiled.js')
    expect(dist).not.toMatch(/readFileSync\(join\(root, 'shared\/sfwCompiled\.js'\)/)
  })

  it('artifacts compile group does not call backend-copy', () => {
    const compile = fs.readFileSync(path.join(root, 'scripts/compile.mjs'), 'utf8')
    const electronArtifactsCase = compile.match(
      /case 'electron-artifacts':([\s\S]*?)case 'artifacts':/,
    )?.[1] ?? ''
    expect(electronArtifactsCase).toContain("runTarget('backend')")
    expect(electronArtifactsCase).not.toContain("runGroup('backend-copy')")
    expect(electronArtifactsCase).not.toContain('copyBackendArtifacts')
  })
})
