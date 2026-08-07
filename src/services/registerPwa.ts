/**
 * Register the PWA service worker in browser/LAN hosts only.
 * Electron already loads the same SPA over localhost and must not own a SW.
 */
export async function registerPwa(): Promise<void> {
  if (typeof window === 'undefined') return
  if (window.electronAPI) return
  if (!('serviceWorker' in navigator)) return

  try {
    const {registerSW} = await import('virtual:pwa-register')
    registerSW({immediate: true})
  } catch (error) {
    console.warn('PWA service worker registration skipped:', error)
  }
}

/**
 * Drop the installed app-shell cache and reload so phones pick up a new build.
 * Safe to call when no service worker is present (still busts the URL).
 */
export async function forceClearAppShellCache(): Promise<void> {
  if (typeof window === 'undefined') return

  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))
  }

  if ('caches' in window) {
    const keys = await caches.keys()
    await Promise.all(keys.map((key) => caches.delete(key)))
  }

  const url = new URL(window.location.href)
  url.searchParams.set('_nocache', String(Date.now()))
  window.location.replace(url.toString())
}
