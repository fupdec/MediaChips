import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import {
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

async function applyZoomFactor(factor: number) {
  const clamped = snapZoom(factor)

  // Prefer CSS zoom over webContents.setZoomFactor. Chromium zoom shrinks the
  // layout viewport and breaks nested flex scroll regions (settings pages get
  // cut off). CSS zoom keeps overflow scroll ranges correct.
  document.documentElement.style.zoom = String(clamped)
  return clamped
}

/** Reset Chromium zoom to 1 so it cannot stack with CSS zoom. */
async function resetChromiumZoomFactor() {
  if (!isElectron() || !window.electronAPI?.invoke) return
  try {
    await window.electronAPI.invoke('setZoomFactor', 1)
  } catch {
    // Non-fatal
  }
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
      await resetChromiumZoomFactor()
      await applyZoomFactor(zoom.value)
    } finally {
      suppressExternalSync = false
    }
  }

  async function syncFromElectron(_factor: number) {
    // App zoom is CSS-based; ignore Chromium zoom-changed so a leftover
    // setZoomFactor(1) cannot reset the saved interface zoom.
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
