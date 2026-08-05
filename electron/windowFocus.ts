import {app, type BrowserWindow} from 'electron'

/**
 * True only when the user can actually see/interact with the window
 * (visible, not minimized, not occluded, focused).
 */
export function isBrowserWindowUserFacing(
  browserWindow: BrowserWindow | null,
  {
    platform = process.platform,
    isAppHidden = () => (
      platform === 'darwin'
      && typeof app.isHidden === 'function'
      && app.isHidden()
    ),
  }: {
    platform?: NodeJS.Platform
    isAppHidden?: () => boolean
  } = {},
): boolean {
  if (!browserWindow || browserWindow.isDestroyed()) return false
  if (!browserWindow.isVisible()) return false
  if (browserWindow.isMinimized()) return false
  if (isAppHidden()) return false
  try {
    const occluded = (browserWindow as BrowserWindow & {isOccluded?: () => boolean}).isOccluded
    if (typeof occluded === 'function' && occluded.call(browserWindow)) {
      return false
    }
  } catch {
    // Older Electron builds may not expose occlusion APIs.
  }
  return browserWindow.isFocused()
}

export function emitMainWindowUserFacingState(browserWindow: BrowserWindow) {
  if (!browserWindow || browserWindow.isDestroyed()) return
  const facing = isBrowserWindowUserFacing(browserWindow)
  browserWindow.webContents.send(facing ? 'focus' : 'blur')
}
