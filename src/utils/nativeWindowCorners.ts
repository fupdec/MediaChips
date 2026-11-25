import {isNativePlayerAvailable} from '@/services/nativePlayer'

/**
 * The native player needs a transparent window, and a transparent window has no system-drawn
 * rounded corners on Windows. Round the page itself instead, and go square again whenever the
 * window fills the screen (maximized or fullscreen).
 */
export function initNativeWindowCorners(): void {
  if (!/win/i.test(navigator.platform || '')) return
  void isNativePlayerAvailable().then((available) => {
    if (!available) return
    const root = document.documentElement
    const update = () => {
      const fills = window.outerWidth >= screen.availWidth - 1 && window.outerHeight >= screen.availHeight - 1
      root.classList.toggle('window-fills-screen', fills)
    }
    root.classList.add('native-transparent-window')
    window.addEventListener('resize', update)
    update()
  })
}
