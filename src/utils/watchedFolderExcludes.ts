/**
 * Browser-safe path helpers for watched-folder excludes.
 * Mirrors server rules: exclude must be a strict child of the root.
 */

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '')
}

export function isStrictChildPath(rootPath: string, childPath: string): boolean {
  const root = normalizeSlashes(String(rootPath || '').trim())
  const child = normalizeSlashes(String(childPath || '').trim())
  if (!root || !child) return false
  if (root.toLowerCase() === child.toLowerCase()) return false
  return child.toLowerCase().startsWith(`${root.toLowerCase()}/`)
}

export function normalizeExcludedPathsClient(
  rootPath: string,
  paths: string[],
): string[] {
  const unique = new Map<string, string>()
  for (const raw of paths) {
    const trimmed = String(raw || '').trim()
    if (!trimmed) continue
    if (!isStrictChildPath(rootPath, trimmed)) continue
    const normalized = normalizeSlashes(trimmed)
    const key = normalized.toLowerCase()
    if (!unique.has(key)) unique.set(key, normalized)
  }
  return [...unique.values()]
}

export function folderIconMdi(icon: string | null | undefined, fallback = 'folder-outline'): string {
  const raw = String(icon || fallback).trim() || fallback
  return raw.startsWith('mdi-') ? raw : `mdi-${raw}`
}
