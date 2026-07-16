import fs from 'fs'
import path from 'path'
import {listSystemPlaceRootPaths} from './systemPlaces'

export type MediaRootEntry = {
  path: string
  name: string
  children: Array<{ path: string; name: string }>
}

export const SKIP_DIR_NAMES = new Set([
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

function isDockerDataRuntime(): boolean {
  return Boolean(process.env.MEDIA_CHIPS_DATA_DIR?.trim())
}

function parseConfiguredRoots(envValue = process.env.MEDIA_CHIPS_MEDIA_ROOTS): string[] {
  if (envValue && envValue.trim()) {
    return envValue
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => path.resolve(entry))
  }

  const defaultParent = path.resolve('/media')
  if (fs.existsSync(defaultParent)) {
    try {
      const mediaRoots = fs.readdirSync(defaultParent, {withFileTypes: true})
        .filter((entry) => entry.isDirectory() && !SKIP_DIR_NAMES.has(entry.name))
        .map((entry) => path.join(defaultParent, entry.name))
        .sort((a, b) => a.localeCompare(b))
      if (mediaRoots.length) return mediaRoots
    } catch {
      // fall through to local system places
    }
  }

  // Local browser / server:dev — curated system places (home, drives, volumes…).
  if (!isDockerDataRuntime()) {
    return listSystemPlaceRootPaths()
  }

  return []
}

/** True when target is the root itself or a nested path under it (supports `/` and `C:\\`). */
export function isPathInsideRoot(targetPath: string, rootPath: string): boolean {
  const target = path.resolve(targetPath)
  const root = path.resolve(rootPath)
  if (target === root) return true

  const relative = path.relative(root, target)
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative)
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
  return parseConfiguredRoots(envValue).some((root) => isPathInsideRoot(targetPath, root))
}

/** Longest matching browse root for breadcrumbs / parent navigation. */
export function findBrowseRootPath(targetPath: string, envValue?: string): string | null {
  const matches = parseConfiguredRoots(envValue)
    .map((root) => path.resolve(root))
    .filter((root) => isPathInsideRoot(targetPath, root))
    .sort((a, b) => b.length - a.length)

  return matches[0] ?? null
}
