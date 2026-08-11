function isElectronRenderer(): boolean {
  return navigator.userAgent.toLowerCase().includes(' electron/')
}

export function isRealWinElectron(): boolean {
  const ua = navigator.userAgent.toLowerCase()
  return ua.includes('windows') && isElectronRenderer()
}

/** True when the app should render Windows custom chrome (SystemBar + window buttons). */
export function isWinElectronUi(): boolean {
  if (isRealWinElectron()) return true
  if (!isElectronRenderer()) return false
  return window.appInfo?.forceWinUi === true
}

/** Desktop Electron shell (Windows / macOS / Linux) — tray settings apply here. */
export function isDesktopElectronUi(): boolean {
  return isElectronRenderer()
}
