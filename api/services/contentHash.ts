import fs from 'fs'
import { access } from 'fs/promises'
import { pathVariants } from '../utils/pathVariants'

const resolveExistingPath = async (pathToFile: string): Promise<string | null> => {
  // Virtual ZIP paths are not real filesystem paths.
  // Only consult zip helpers when `!/` is present — and require `.zip!/` (not `Folder!/file`).
  if (typeof pathToFile === 'string' && pathToFile.includes('!/')) {
    const { isVirtualZipPath } = await import('./zipGallery')
    if (isVirtualZipPath(pathToFile)) {
      return null
    }
  }

  for (const variant of pathVariants(pathToFile)) {
    try {
      await access(variant, fs.constants.F_OK)
      return variant
    } catch {
      // try next variant
    }
  }

  return null
}

const fileExists = async (pathToFile: string) => {
  if (typeof pathToFile === 'string' && pathToFile.includes('!/')) {
    const { isVirtualZipPath, zipEntryExists } = await import('./zipGallery')
    if (isVirtualZipPath(pathToFile)) {
      return zipEntryExists(pathToFile)
    }
  }

  return Boolean(await resolveExistingPath(pathToFile))
}

export {
  fileExists,
  resolveExistingPath,
  pathVariants,
}
