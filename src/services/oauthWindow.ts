import {openExternal} from '@/services/shellService'
import {useAppStore} from '@/stores/app'

/** How the backend expects the OAuth redirect to come back. */
export type OAuthLaunchMode = 'callback' | 'paste'

/**
 * Open a blank sign-in window synchronously inside the click handler, before any
 * await, so browsers do not block it. Electron signs in in the system browser.
 */
export function prepareOAuthWindow(name = 'mediachips-oauth'): Window | null {
  if (useAppStore().isElectron) return null
  return window.open('about:blank', name, 'popup,width=560,height=720')
}

/** Send the prepared window (or the system browser) to the provider sign-in page. */
export async function openOAuthUrl(win: Window | null | undefined, url: string): Promise<boolean> {
  if (useAppStore().isElectron) { await openExternal(url); return true }
  if (win && !win.closed) {
    try { win.opener = null } catch { /* cross-origin already */ }
    win.location.href = url
    return true
  }
  return !!window.open(url, '_blank', 'noopener')
}

export function closeOAuthWindow(win: Window | null | undefined) {
  try { if (win && !win.closed) win.close() } catch { /* ignore */ }
}
