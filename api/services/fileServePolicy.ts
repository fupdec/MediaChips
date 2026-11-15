import fs from 'fs'
import path from 'path'
import { isPathInside } from '../utils/isPathInside'

/**
 * Guard for /api/get-file. The endpoint resolves arbitrary absolute paths
 * (media can live anywhere the user points the library at), so instead of an
 * allowlist of roots we refuse the things a media viewer never needs:
 * hidden files/folders (~/.ssh, ~/.aws, .env, .git…), credential and database
 * files, files without an extension (browser cookie stores, `id_rsa`,
 * `credentials`…) and OS internals. The app's own storage folder is trusted
 * for hidden/extensionless thumbs, but databases and tokens stay blocked there too.
 */

const BLOCKED_EXTENSIONS = new Set([
  '.db', '.db-wal', '.db-shm', '.db-journal',
  '.sqlite', '.sqlite3', '.sqlite-wal', '.sqlite-shm',
  '.pem', '.key', '.p12', '.pfx', '.crt', '.cer', '.der', '.asc', '.gpg', '.pgp',
  '.kdbx', '.keychain', '.keychain-db', '.ovpn', '.ppk',
  '.env', '.npmrc', '.netrc', '.pgpass',
])

const BLOCKED_BASENAMES = new Set([
  'tokens.json',
  'drive-oauth-tokens.json',
  'credentials.json',
  'client_secret.json',
  'login data',
  'cookies',
  'web data',
])

const POSIX_SYSTEM_ROOTS = ['/etc', '/proc', '/sys', '/dev', '/private/etc', '/private/var/db']

export type FileServeDecision = {allowed: true} | {allowed: false; reason: string}

export type FileServePolicyOptions = {
  /** Folders whose hidden / extensionless files are app-managed (thumbs, meta). */
  trustedRoots?: Array<string | null | undefined>
  platform?: NodeJS.Platform
}

type PathApi = typeof path.posix

function realPathOrSelf(target: string, pathApi: PathApi, native: boolean): string {
  if (native) {
    try {
      return fs.realpathSync.native(target)
    } catch {
      // fall through — missing files are rejected later by the route
    }
  }
  return pathApi.resolve(target)
}

function isInside(pathApi: PathApi, parent: string, child: string): boolean {
  if (pathApi === path) return isPathInside(parent, child)
  const relative = pathApi.relative(pathApi.resolve(parent), pathApi.resolve(child))
  return relative === '' || (!relative.startsWith('..') && !pathApi.isAbsolute(relative))
}

function hasHiddenSegment(target: string, pathApi: PathApi): boolean {
  const {root} = pathApi.parse(target)
  return target
    .slice(root.length)
    .split(/[\\/]+/)
    .some((segment) => segment.startsWith('.') && segment !== '.' && segment !== '..')
}

function isWindowsSystemPath(target: string): boolean {
  const lower = target.toLowerCase().replace(/\//g, '\\')
  return /^[a-z]:\\windows(\\|$)/.test(lower) || /^[a-z]:\\programdata\\microsoft(\\|$)/.test(lower)
}

export function evaluateFileServe(filePath: string, options: FileServePolicyOptions = {}): FileServeDecision {
  const platform = options.platform ?? process.platform
  const pathApi: PathApi = platform === process.platform ? path : (platform === 'win32' ? path.win32 : path.posix)
  const native = platform === process.platform
  const resolved = realPathOrSelf(filePath, pathApi, native)
  const basename = pathApi.basename(resolved).toLowerCase()
  const ext = pathApi.extname(basename)

  if (BLOCKED_EXTENSIONS.has(ext) || BLOCKED_BASENAMES.has(basename) || basename.startsWith('.env')) {
    return {allowed: false, reason: 'sensitive-file'}
  }

  if (platform === 'win32') {
    if (isWindowsSystemPath(resolved)) return {allowed: false, reason: 'system-path'}
  } else if (POSIX_SYSTEM_ROOTS.some((root) => isInside(pathApi, root, resolved))) {
    return {allowed: false, reason: 'system-path'}
  }

  const trusted = (options.trustedRoots ?? [])
    .filter((root): root is string => typeof root === 'string' && root.trim() !== '')
    .some((root) => isInside(pathApi, realPathOrSelf(root, pathApi, native), resolved))
  if (trusted) return {allowed: true}

  if (hasHiddenSegment(resolved, pathApi)) return {allowed: false, reason: 'hidden-path'}
  if (!ext) return {allowed: false, reason: 'no-extension'}

  return {allowed: true}
}
