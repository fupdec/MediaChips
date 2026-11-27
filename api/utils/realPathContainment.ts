import fs from 'fs'
import path from 'path'
import { isPathInside } from './isPathInside'

/**
 * Resolve symlinks for the longest existing prefix of `target` and re-append the
 * not-yet-existing remainder, so a file that does not exist yet (an output path)
 * is still checked against where it would really land.
 */
export function realPathOfPossiblyMissing(target: string): string {
  const resolved = path.resolve(target)
  const missing: string[] = []
  let current = resolved

  for (;;) {
    try {
      return path.join(fs.realpathSync.native(current), ...missing.reverse())
    } catch {
      const parent = path.dirname(current)
      if (parent === current) return resolved
      missing.push(path.basename(current))
      current = parent
    }
  }
}

/** True when `target` really lives under `root` once symlinks are resolved. */
export function isRealPathInside(root: string | null | undefined, target: string): boolean {
  if (!root || !target) return false
  return isPathInside(realPathOfPossiblyMissing(root), realPathOfPossiblyMissing(target))
}

const OUTPUT_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])

/**
 * Validate a client-supplied output path for generated images: it must be an image
 * file name and stay inside the app data folder (symlinks and `..` included).
 * Returns the normalized path, or null when it is not allowed.
 */
export function resolveGeneratedImageOutput(
  outputPath: unknown,
  dataRoot: string | null | undefined,
): string | null {
  if (typeof outputPath !== 'string' || !outputPath.trim() || outputPath.includes('\0')) return null
  if (!dataRoot || !path.isAbsolute(outputPath)) return null
  if (!OUTPUT_IMAGE_EXTENSIONS.has(path.extname(outputPath).toLowerCase())) return null

  const normalized = path.normalize(outputPath)
  return isRealPathInside(dataRoot, normalized) ? normalized : null
}
