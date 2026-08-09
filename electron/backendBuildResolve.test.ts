import path from 'path'
import {describe, expect, it} from 'vitest'
import {rewriteBackendRequest} from './backendBuildResolve'

const root = '/app'
const backendBuild = path.join(root, '.backend-build')

describe('rewriteBackendRequest', () => {
  it('rewrites electron ../api imports onto .backend-build', () => {
    const parent = path.join(root, 'electron', 'autoUpdater.js')
    expect(rewriteBackendRequest('../api/types/errors', parent, root, backendBuild)).toBe(
      path.join(backendBuild, 'api', 'types', 'errors'),
    )
  })

  it('rewrites main.js ./app imports onto .backend-build', () => {
    const parent = path.join(root, 'main.js')
    expect(rewriteBackendRequest('./app/server/configFile', parent, root, backendBuild)).toBe(
      path.join(backendBuild, 'app', 'server', 'configFile'),
    )
  })

  it('rewrites electron ../shared imports onto .backend-build', () => {
    const parent = path.join(root, 'electron', 'appMenu.js')
    expect(rewriteBackendRequest('../shared/features', parent, root, backendBuild)).toBe(
      path.join(backendBuild, 'shared', 'features'),
    )
  })

  it('does not rewrite node_modules or absolute requests', () => {
    const parent = path.join(root, 'electron', 'autoUpdater.js')
    expect(rewriteBackendRequest('electron-updater', parent, root, backendBuild)).toBeNull()
    expect(rewriteBackendRequest('/tmp/x', parent, root, backendBuild)).toBeNull()
  })

  it('does not rewrite requires that already live under .backend-build', () => {
    const parent = path.join(backendBuild, 'app', 'server.js')
    expect(rewriteBackendRequest('../api/types/errors', parent, root, backendBuild)).toBeNull()
  })
})
