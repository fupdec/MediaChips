import fs from 'fs'
import {projectPath} from '../../shared/projectRoot'
import path from 'path'

/**
 * Resolve a web-root asset like `/images/unavailable.png` to a file on disk.
 * Checks public/ (dev) and dist/ (production) relative to the API package and cwd.
 */
export function resolveBundledPublicFile(webPath: string): string | null {
  const trimmed = String(webPath || '').trim()
  if (!trimmed.startsWith('/')) return null

  const relative = trimmed.replace(/^\/+/, '')
  // Only allow static asset folders we ship; block path traversal.
  if (
    relative.includes('..')
    || path.isAbsolute(relative)
    || !(
      relative.startsWith('images/')
      || relative.startsWith('icons/')
      || relative.startsWith('fonts/')
    )
  ) {
    return null
  }

  const roots = [
    projectPath('public'),
    projectPath('dist'),
    path.join(process.cwd(), 'public'),
    path.join(process.cwd(), 'dist'),
  ]

  for (const root of roots) {
    const candidate = path.join(root, relative)
    if (!candidate.startsWith(path.resolve(root) + path.sep) && candidate !== path.resolve(root)) {
      continue
    }
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate
    }
  }

  return null
}
