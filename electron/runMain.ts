/**
 * Electron entry bootstrap.
 *
 * Dev (`npm run electron`) compiles the backend to `.backend-build` without
 * copy-back. Rewrites main.js's relative `./api|app|shared/...` requires onto
 * that tree. Packaged builds omit `.backend-build` and keep using source-tree JS
 * produced by `backend-copy`.
 */
import fs from 'fs'
import path from 'path'
import Module from 'module'

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
    if (
      typeof request === 'string'
      && parent?.filename === mainPath
      && (
        request.startsWith('./api/')
        || request.startsWith('./app/')
        || request.startsWith('./shared/')
      )
    ) {
      const candidate = path.join(backendBuild, request.slice(2))
      try {
        return originalResolveFilename(candidate, parent, isMain, options)
      } catch {
        // fall through to the default resolution
      }
    }

    return originalResolveFilename(request, parent, isMain, options)
  }
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
require(mainPath)
