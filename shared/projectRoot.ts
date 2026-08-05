import fs from 'fs'
import path from 'path'

const BUILD_DIR_NAMES = new Set([
  '.api-build',
  '.app-build',
  '.shared-build',
  '.backend-build',
  '.electron-build',
  '.main-build',
  '.scripts-build',
  'node_modules',
])

let cachedRoot: string | null = null

/**
 * Resolve the mediachips repo root from any compiled or source module path.
 * Walks parents until `package.json` with `"name": "mediachips"` is found.
 * Skips tsc outDirs (they may contain a copied package.json via JSON imports).
 */
export function getProjectRoot(startDir: string = __dirname): string {
  if (cachedRoot) return cachedRoot

  let dir = path.resolve(startDir)
  for (;;) {
    const pkgPath = path.join(dir, 'package.json')
    if (fs.existsSync(pkgPath) && !BUILD_DIR_NAMES.has(path.basename(dir))) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {name?: string}
        if (pkg.name === 'mediachips') {
          cachedRoot = dir
          return dir
        }
      } catch {
        // continue walking
      }
    }

    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  throw new Error(`Unable to resolve mediachips project root from ${startDir}`)
}

/** Join segments onto the project root. */
export function projectPath(...segments: string[]): string {
  return path.join(getProjectRoot(), ...segments)
}

/** Test helper — clears the cached root. */
export function resetProjectRootCache(): void {
  cachedRoot = null
}
