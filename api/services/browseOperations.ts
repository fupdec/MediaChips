import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import {normalizeMediaPath} from '../utils/normalizeUserPath'
import {isPathInsideMediaRoots, isPathInsideRoot, listMediaRoots} from './mediaRoots'
import type {BrowseDirectoryEntry, BrowseDirectoryResult} from './browseDirectory'

export type FsOperationEntry = {
  path: string
  name: string
}

export type FsDeleteResult = {
  deleted: string[]
  failed: Array<{path: string; reason: string}>
}

export type FsCopyResult = {
  copied: string[]
  failed: Array<{path: string; reason: string}>
}

export type FsMoveResult = {
  moved: string[]
  failed: Array<{path: string; reason: string}>
}

function accessError(resolved: string): Error {
  return Object.assign(
    new Error(`Path is outside configured media roots: ${resolved}`),
    {status: 403},
  )
}

async function physicalPath(resolved: string): Promise<string> {
  let existing = resolved
  while (true) {
    try {
      const canonicalExisting = await fsp.realpath(existing)
      return path.join(canonicalExisting, path.relative(existing, resolved))
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') throw err
      const parent = path.dirname(existing)
      if (parent === existing) throw err
      existing = parent
    }
  }
}

async function checkAccess(entryPath: string, envValue?: string, allowMissing = false) {
  const resolved = path.resolve(normalizeMediaPath(entryPath))
  if (!isPathInsideMediaRoots(resolved, envValue)) throw accessError(resolved)

  let physical: string
  try {
    physical = allowMissing ? await physicalPath(resolved) : await fsp.realpath(resolved)
  } catch (err: unknown) {
    // Preserve normal filesystem errors for existing sources, while allowing
    // callers that create destinations to validate their physical parent.
    if (!allowMissing || (err as NodeJS.ErrnoException)?.code !== 'ENOENT') throw err
    physical = await physicalPath(resolved)
  }
  if (!await isPhysicalPathInsideMediaRoots(physical, envValue)) throw accessError(resolved)
  return {resolved, physical}
}

function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child)
  return relative === '' || (!path.isAbsolute(relative) && !relative.startsWith('..'))
}

async function isPhysicalPathInsideMediaRoots(target: string, envValue?: string): Promise<boolean> {
  const configuredRoots = envValue?.trim()
    ? envValue.split(',').map((root) => path.resolve(normalizeMediaPath(root.trim()))).filter(Boolean)
    : listMediaRoots().map((root) => root.path)
  const physicalRoots = await Promise.all(configuredRoots.map(async (root) => {
    try {
      return await fsp.realpath(root)
    } catch {
      return null
    }
  }))
  return physicalRoots.some((root) => root != null && isPathInsideRoot(target, root))
}

async function removeRecursive(targetPath: string): Promise<void> {
  const stat = await fsp.stat(targetPath)
  if (stat.isDirectory()) {
    await fsp.rm(targetPath, {recursive: true, force: true})
  } else {
    await fsp.unlink(targetPath)
  }
}

async function copyRecursive(src: string, dest: string): Promise<void> {
  const stat = await fsp.stat(src)
  if (stat.isDirectory()) {
    await fsp.cp(src, dest, {recursive: true})
  } else {
    await fsp.cp(src, dest)
  }
}

export async function deleteEntries(
  entries: FsOperationEntry[],
  envValue?: string,
): Promise<FsDeleteResult> {
  const deleted: string[] = []
  const failed: FsDeleteResult['failed'] = []

  for (const entry of entries) {
    try {
      const {resolved} = await checkAccess(entry.path, envValue)
      await removeRecursive(resolved)
      deleted.push(entry.path)
    } catch (err: unknown) {
      failed.push({
        path: entry.path,
        reason: (err as Error)?.message || 'Unknown error',
      })
    }
  }

  return {deleted, failed}
}

export async function copyEntries(
  entries: FsOperationEntry[],
  destination: string,
  envValue?: string,
): Promise<FsCopyResult> {
  const copied: string[] = []
  const failed: FsCopyResult['failed'] = []

  const {resolved: dest, physical: physicalDest} = await checkAccess(destination, envValue, true)

  for (const entry of entries) {
    try {
      const {resolved: src, physical: physicalSrc} = await checkAccess(entry.path, envValue)
      const basename = path.basename(src)
      if ((await fsp.stat(src)).isDirectory() && isPathInside(physicalSrc, physicalDest)) {
        throw new Error('Cannot copy a directory into itself')
      }
      const target = path.join(dest, basename)
      await copyRecursive(src, target)
      copied.push(entry.path)
    } catch (err: unknown) {
      failed.push({
        path: entry.path,
        reason: (err as Error)?.message || 'Unknown error',
      })
    }
  }

  return {copied, failed}
}

export async function moveEntries(
  entries: FsOperationEntry[],
  destination: string,
  envValue?: string,
): Promise<FsMoveResult> {
  const moved: string[] = []
  const failed: FsMoveResult['failed'] = []

  const {resolved: dest, physical: physicalDest} = await checkAccess(destination, envValue, true)

  for (const entry of entries) {
    try {
      const {resolved: src, physical: physicalSrc} = await checkAccess(entry.path, envValue)
      const basename = path.basename(src)
      if ((await fsp.stat(src)).isDirectory() && isPathInside(physicalSrc, physicalDest)) {
        throw new Error('Cannot move a directory into itself')
      }
      const target = path.join(dest, basename)
      await fsp.rename(src, target)
      moved.push(entry.path)
    } catch (err: unknown) {
      failed.push({
        path: entry.path,
        reason: (err as Error)?.message || 'Unknown error',
      })
    }
  }

  return {moved, failed}
}

export function validateEntries(
  entries: unknown,
): entries is FsOperationEntry[] {
  if (!Array.isArray(entries) || !entries.length) {
    throw Object.assign(new Error('Entries array is required and must be non-empty'), {status: 400})
  }
  for (const entry of entries) {
    if (
      typeof entry !== 'object'
      || entry == null
      || typeof (entry as FsOperationEntry).path !== 'string'
      || !(entry as FsOperationEntry).path.trim()
    ) {
      throw Object.assign(
        new Error('Each entry must have a non-empty string "path"'),
        {status: 400},
      )
    }
  }
  return true
}

export async function createFolder(
  targetPath: string,
  envValue?: string,
): Promise<{created: string}> {
  const {resolved} = await checkAccess(targetPath, envValue, true)
  await fsp.mkdir(resolved, {recursive: false})
  return {created: targetPath}
}

export async function renameEntry(
  oldPath: string,
  newName: string,
  envValue?: string,
): Promise<{renamed: string}> {
  const {resolved: resolvedOld} = await checkAccess(oldPath, envValue)
  const dir = path.dirname(resolvedOld)
  const resolvedNew = path.join(dir, newName)

  // Validate new name doesn't contain path separators
  if (path.basename(newName) !== newName || !newName.trim()) {
    throw Object.assign(
      new Error('Invalid name'),
      {status: 400},
    )
  }

  // Check the new path is also inside media roots
  await checkAccess(resolvedNew, envValue, true)

  // Check target doesn't already exist
  try {
    await fsp.access(resolvedNew)
    throw Object.assign(
      new Error('A file or folder with this name already exists'),
      {status: 409},
    )
  } catch (err: unknown) {
    if ((err as {status?: number})?.status === 409) throw err
    // ENOENT is expected — targetPath doesn't exist yet
  }

  await fsp.rename(resolvedOld, resolvedNew)
  return {renamed: resolvedNew}
}