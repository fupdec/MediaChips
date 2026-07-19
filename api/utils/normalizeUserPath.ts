import path from 'path'
import { pathVariants } from '../services/contentHash'

function normalizeUserPath(value: unknown): unknown {
  if (value == null || typeof value !== 'string') return value

  let result = value.trim()
  if (result.length < 2) return result

  const first = result[0]
  const last = result[result.length - 1]
  const isQuoted =
    (first === "'" && last === "'") ||
    (first === '"' && last === '"') ||
    (first === '\u2018' && last === '\u2019') ||
    (first === '\u201C' && last === '\u201D') ||
    (first === '`' && last === '`')

  if (isQuoted) {
    result = result.slice(1, -1).trim()
  }

  return result
}

function normalizeMediaPath(value: unknown): string {
  if (value == null || typeof value !== 'string') return String(value ?? '')

  const userPath = normalizeUserPath(value)
  if (typeof userPath !== 'string') {
    return String(userPath ?? '')
  }

  let result: string = path.normalize(userPath)

  if (typeof result.normalize === 'function') {
    result = result.normalize('NFC')
  }

  return result
}

function pathsEquivalent(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false
  if (left === right) return true

  const leftCanonical = normalizeMediaPath(left)
  const rightCanonical = normalizeMediaPath(right)

  if (leftCanonical === rightCanonical) return true
  if (leftCanonical.toLowerCase() === rightCanonical.toLowerCase()) return true

  const leftSet = new Set(pathVariants(leftCanonical).map((item: string) => item.toLowerCase()))

  return pathVariants(rightCanonical).some((item: string) => leftSet.has(item.toLowerCase()))
}

function buildPathLookupVariants(value: string): string[] {
  const canonical = normalizeMediaPath(value)
  const seeds = new Set<string>()

  if (canonical) {
    seeds.add(canonical)
    seeds.add(canonical.replace(/\\/g, '/'))
    seeds.add(canonical.replace(/\//g, '\\'))
  }

  const variants = new Set<string>()
  for (const seed of seeds) {
    for (const variant of pathVariants(seed)) {
      variants.add(variant)
    }
  }

  return [...variants]
}

function isPathInsideFolder(filePath: string, folderPath: string): boolean {
  if (!filePath || !folderPath) return false

  const normalizedFile = path.resolve(normalizeMediaPath(filePath))
  const normalizedFolder = path.resolve(normalizeMediaPath(folderPath))
  const relative = path.relative(normalizedFolder, normalizedFile)

  if (!relative || relative === '.') return false

  return !relative.startsWith('..') && !path.isAbsolute(relative)
}

export {
  normalizeUserPath,
  normalizeMediaPath,
  pathsEquivalent,
  buildPathLookupVariants,
  isPathInsideFolder,
}
