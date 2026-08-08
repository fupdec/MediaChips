import {app, type BrowserWindow} from 'electron'

/**
 * True when the user can interact with the window (visible, not minimized,
 * focused). Occlusion alone must not count as "not facing" — overlapping IDE
 * windows false-trigger blur and kill hover with zero UI feedback.
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
  return browserWindow.isFocused()
}

export function emitMainWindowUserFacingState(browserWindow: BrowserWindow) {
  if (!browserWindow || browserWindow.isDestroyed()) return
  const facing = isBrowserWindowUserFacing(browserWindow)
  browserWindow.webContents.send(facing ? 'focus' : 'blur')
}
