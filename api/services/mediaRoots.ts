import fs from 'fs'
import path from 'path'

export type MediaRootEntry = {
  path: string
  name: string
  children: Array<{ path: string; name: string }>
}

const SKIP_DIR_NAMES = new Set([
  '.',
  '..',
  'lost+found',
  '@eaDir',
  '#recycle',
  '$RECYCLE.BIN',
  'System Volume Information',
  // Alpine base image placeholders under /media — not real library mounts.
  'cdrom',
  'floppy',
  'usb',
])

function parseConfiguredRoots(envValue = process.env.MEDIA_CHIPS_MEDIA_ROOTS): string[] {
  if (envValue && envValue.trim()) {
    return envValue
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => path.resolve(entry))
  }

  const defaultParent = path.resolve('/media')
  if (!fs.existsSync(defaultParent)) return []

  try {
    return fs.readdirSync(defaultParent, {withFileTypes: true})
      .filter((entry) => entry.isDirectory() && !SKIP_DIR_NAMES.has(entry.name))
      .map((entry) => path.join(defaultParent, entry.name))
      .sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}

function listChildDirectories(rootPath: string, limit = 40): Array<{ path: string; name: string }> {
  try {
    return fs.readdirSync(rootPath, {withFileTypes: true})
      .filter((entry) => entry.isDirectory() && !SKIP_DIR_NAMES.has(entry.name) && !entry.name.startsWith('.'))
      .slice(0, limit)
      .map((entry) => ({
        name: entry.name,
        path: path.join(rootPath, entry.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

export function listMediaRoots(envValue?: string): MediaRootEntry[] {
  const roots = parseConfiguredRoots(envValue)
  const result: MediaRootEntry[] = []

  for (const rootPath of roots) {
    try {
      const stats = fs.statSync(rootPath)
      if (!stats.isDirectory()) continue
      result.push({
        path: rootPath,
        name: path.basename(rootPath) || rootPath,
        children: listChildDirectories(rootPath),
      })
    } catch {
      // Skip unreadable / missing mounts
    }
  }

  return result
}

export function isPathInsideMediaRoots(targetPath: string, envValue?: string): boolean {
  const normalizedTarget = path.resolve(targetPath)
  return parseConfiguredRoots(envValue).some((root) => {
    const normalizedRoot = path.resolve(root)
    return normalizedTarget === normalizedRoot
      || normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`)
  })
}
