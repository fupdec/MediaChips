function isElectronRenderer(): boolean {
  return navigator.userAgent.toLowerCase().includes(' electron/')
}

export function isRealWinElectron(): boolean {
  const ua = navigator.userAgent.toLowerCase()
  return ua.includes('windows') && isElectronRenderer()
}

export function isWinElectronUi(): boolean {
  return isRealWinElectron()
}

/** Desktop Electron shell (Windows / macOS / Linux) — tray settings apply here. */
export function isDesktopElectronUi(): boolean {
  return isElectronRenderer()
}
