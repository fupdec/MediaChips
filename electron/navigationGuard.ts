import {shell, type WebContents} from 'electron'
import {parseExternalUrl} from './shellIpc'

function originOf(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl)
    // `null` origins (file:, about:) never count as the app origin.
    return parsed.origin === 'null' ? null : parsed.origin
  } catch {
    return null
  }
}

/**
 * Windows here run a preload bridge with `sandbox: false`, so a page that
 * navigated away from the app (a link, a redirect, injected markup) would get
 * the bridge too. Keep the window on the app origin and hand everything else
 * to the system browser.
 */
export function bindNavigationGuard(
  webContents: WebContents,
  getAppUrl: () => string,
  openExternal: (url: string) => void = (url) => { void shell.openExternal(url) },
) {
  const isAppUrl = (url: string) => {
    const appOrigin = originOf(getAppUrl())
    return appOrigin !== null && originOf(url) === appOrigin
  }

  const openOutside = (url: string) => {
    const parsed = parseExternalUrl(url)
    if (parsed.ok) openExternal(parsed.url)
  }

  webContents.setWindowOpenHandler(({url}) => {
    openOutside(url)
    return {action: 'deny'}
  })

  webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return
    event.preventDefault()
    openOutside(url)
  })

  webContents.on('will-redirect', (event, url) => {
    if (isAppUrl(url)) return
    event.preventDefault()
  })

  webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })
}
