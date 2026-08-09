/**
 * Electron entry bootstrap.
 *
 * Dev, postinstall, and pack all emit backend JS to `.backend-build` (no
 * api/app/shared copy-back). Rewrites relative `api|app|shared/...` requires
 * from main.js and electron/*.js onto that tree when present.
 */
import fs from 'fs'
import path from 'path'
import Module from 'module'
import {rewriteBackendRequest} from './backendBuildResolve'

type ResolveFilename = (
  request: string,
  parent: NodeModule | undefined,
  isMain?: boolean,
  options?: unknown,
) => string

const root = path.join(__dirname, '..')
const mainPath = path.join(root, 'main.js')
const backendBuild = path.join(root, '.backend-build')
const useBackendBuild = fs.existsSync(path.join(backendBuild, 'app', 'server.js'))

if (useBackendBuild) {
  const moduleAny = Module as unknown as {_resolveFilename: ResolveFilename}
  const originalResolveFilename = moduleAny._resolveFilename.bind(Module) as ResolveFilename

  moduleAny._resolveFilename = function (request, parent, isMain, options) {
    const rewritten = rewriteBackendRequest(request, parent?.filename, root, backendBuild)
    if (rewritten) {
      try {
        return originalResolveFilename(rewritten, parent, isMain, options)
      } catch {
        // fall through to the default resolution
      }
    }

    return originalResolveFilename(request, parent, isMain, options)
  }
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
require(mainPath)
