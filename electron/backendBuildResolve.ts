import path from 'path'

const BACKEND_ROOTS = new Set(['api', 'app', 'shared'])

/**
 * Map a relative require from the app package onto `.backend-build/...`
 * when it would otherwise resolve to source-tree `api|app|shared`.
 */
export function rewriteBackendRequest(
  request: string,
  parentFilename: string | undefined,
  root: string,
  backendBuild: string,
): string | null {
  if (!parentFilename || typeof request !== 'string') return null
  if (!request.startsWith('.')) return null

  const parentRel = path.relative(root, parentFilename)
  if (!parentRel || parentRel.startsWith('..') || path.isAbsolute(parentRel)) return null
  if (parentRel.split(path.sep)[0] === '.backend-build') return null

  const resolved = path.resolve(path.dirname(parentFilename), request)
  const rel = path.relative(root, resolved)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null

  const top = rel.split(path.sep)[0]
  if (!BACKEND_ROOTS.has(top)) return null

  return path.join(backendBuild, rel)
}
