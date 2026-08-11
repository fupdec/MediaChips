import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import {
  applyAppZoomStyles,
  formatZoomPercent,
  getNextZoom,
  parseZoom,
  snapZoom,
} from '@/utils/appZoom'
import { setOption } from '@/services/settingsService'

let suppressExternalSync = false

function isElectron() {
  return typeof window !== 'undefined'
    && navigator.userAgent.toLowerCase().includes(' electron/')
}

function clearCssZoomStyles() {
  applyAppZoomStyles(document.documentElement.style, 1)
}

async function applyZoomFactor(factor: number) {
  const clamped = snapZoom(factor)

  // Electron: Chromium zoom factor scales images, canvases, and observers correctly.
  // CSS zoom + inverse height was clipping settings OR collapsing video thumbs.
  if (isElectron() && window.electronAPI?.invoke) {
    clearCssZoomStyles()
    try {
      await window.electronAPI.invoke('setZoomFactor', clamped)
      return clamped
    } catch {
      // Fall through to CSS zoom if IPC is unavailable.
    }
  }

  return applyAppZoomStyles(document.documentElement.style, clamped)
}

export function useAppZoom() {
  const settingsStore = useSettingsStore()

  const zoom = computed(() => parseZoom(settingsStore.zoom))

  async function setZoom(value: number, { persist = true, apply = true } = {}) {
    const clamped = snapZoom(value)

    if (apply) {
      suppressExternalSync = true
      try {
        await applyZoomFactor(clamped)
      } finally {
        suppressExternalSync = false
      }
    }

    settingsStore.zoom = String(clamped)

    if (persist) {
      await setOption(String(clamped), 'zoom')
    }

    return clamped
  }

  async function zoomIn() {
    return setZoom(getNextZoom(zoom.value, 1))
  }

  async function zoomOut() {
    return setZoom(getNextZoom(zoom.value, -1))
  }

  async function resetZoom() {
    return setZoom(1)
  }

  async function initFromSettings() {
    suppressExternalSync = true
    try {
      await applyZoomFactor(zoom.value)
    } finally {
      suppressExternalSync = false
    }
  }

  async function syncFromElectron(factor: number) {
    if (suppressExternalSync) return
    const clamped = snapZoom(factor)
    if (Math.abs(clamped - zoom.value) < 0.001) return
    // Chromium already applied the factor; only persist / sync store.
    await setZoom(clamped, {persist: true, apply: false})
  }

  function shouldHandleZoomShortcut(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey)) return false
    if (event.altKey) return false

    const target = event.target
    if (!(target instanceof Element)) return false

    const tagName = target.tagName
    if (tagName === 'INPUT' || tagName === 'TEXTAREA' || (target as HTMLElement).isContentEditable) {
      return false
    }

    return true
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!shouldHandleZoomShortcut(event)) return

    if (event.key === '=' || event.key === '+') {
      event.preventDefault()
      void zoomIn()
      return
    }

    if (event.key === '-' || event.key === '_') {
      event.preventDefault()
      void zoomOut()
      return
    }

    if (event.key === '0') {
      event.preventDefault()
      void resetZoom()
    }
  }

  function blockPinchZoom(event: WheelEvent) {
    if (!shouldHandleZoomShortcut(event as unknown as KeyboardEvent)) return
    if (!event.ctrlKey && !event.metaKey) return

    event.preventDefault()
  }

  return {
    zoom,
    setZoom,
    zoomIn,
    zoomOut,
    resetZoom,
    initFromSettings,
    syncFromElectron,
    handleKeydown,
    blockPinchZoom,
    formatZoomPercent,
  }
}

export { formatZoomPercent }
