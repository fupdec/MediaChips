import fs from 'fs'
import path from 'path'

export type WindowIconPlatform = 'win32' | 'darwin' | 'linux' | string

/**
 * Resolve a BrowserWindow icon path that works in packaged builds.
 * Windows taskbar prefers `.ico`; splash previously pointed at unpackaged `icons/`.
 */
export function resolveWindowIconPath(
  appRoot: string,
  platform: WindowIconPlatform = process.platform,
): string {
  const iconDir = path.join(appRoot, 'dist', 'icons')
  const icoPath = path.join(iconDir, 'favicon.ico')
  const pngPath = path.join(iconDir, 'icon.png')
  const legacyPngPath = path.join(appRoot, 'icons', 'icon.png')

  if (platform === 'win32') {
    if (fs.existsSync(icoPath)) return icoPath
    if (fs.existsSync(pngPath)) return pngPath
    if (fs.existsSync(legacyPngPath)) return legacyPngPath
    return icoPath
  }

  if (fs.existsSync(pngPath)) return pngPath
  if (fs.existsSync(icoPath)) return icoPath
  if (fs.existsSync(legacyPngPath)) return legacyPngPath
  return pngPath
}
