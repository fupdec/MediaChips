import {ref, type Ref} from 'vue'
import {useImageViewerStore} from '@/stores/imageViewer'

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
}

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
}

/** Browser Fullscreen API wrapper for the image viewer, with a dialog-fullscreen fallback. */
export function useImageViewerFullscreen(deps: {
  viewerRootRef: Ref<HTMLElement | null>
  bumpChrome: () => void
}) {
  const viewer = useImageViewerStore()
  const enteredBrowserFullscreen = ref(false)

  const getFullscreenElement = (): Element | null => {
    const doc = document as FullscreenDocument
    return document.fullscreenElement || doc.webkitFullscreenElement || null
  }

  const isOurBrowserFullscreen = () => {
    const fsEl = getFullscreenElement()
    const root = deps.viewerRootRef.value
    return Boolean(root && fsEl && (fsEl === root || root.contains(fsEl)))
  }

  const requestBrowserFullscreen = async (el: HTMLElement) => {
    const target = el as FullscreenElement
    if (target.requestFullscreen) {
      await target.requestFullscreen()
      return
    }
    if (target.webkitRequestFullscreen) {
      await target.webkitRequestFullscreen()
    }
  }

  const exitBrowserFullscreen = async () => {
    if (!getFullscreenElement()) return
    const doc = document as FullscreenDocument
    if (document.exitFullscreen) {
      await document.exitFullscreen()
      return
    }
    if (doc.webkitExitFullscreen) {
      await doc.webkitExitFullscreen()
    }
  }

  /** Cleanup for viewer close/unmount: drop browser fullscreen without touching dialog state. */
  const forceExitFullscreen = () => {
    void exitBrowserFullscreen().catch(() => {})
    enteredBrowserFullscreen.value = false
  }

  const syncFullscreenFromDocument = () => {
    if (!viewer.active) return

    if (isOurBrowserFullscreen()) {
      enteredBrowserFullscreen.value = true
      viewer.setFullscreen(true)
      return
    }

    if (enteredBrowserFullscreen.value) {
      enteredBrowserFullscreen.value = false
      viewer.setFullscreen(false)
    }
  }

  const toggleFullscreen = async () => {
    deps.bumpChrome()
    const root = deps.viewerRootRef.value

    try {
      if (isOurBrowserFullscreen() || (enteredBrowserFullscreen.value && getFullscreenElement())) {
        await exitBrowserFullscreen()
        return
      }

      if (root) {
        await requestBrowserFullscreen(root)
        enteredBrowserFullscreen.value = true
        viewer.setFullscreen(true)
        return
      }
    } catch (error) {
      console.error('Browser fullscreen failed, falling back to dialog fullscreen:', error)
    }

    // Fallback when Fullscreen API is blocked/unavailable (some embeds / permissions).
    viewer.toggleFullscreen()
  }

  return {
    enteredBrowserFullscreen,
    getFullscreenElement,
    isOurBrowserFullscreen,
    exitBrowserFullscreen,
    forceExitFullscreen,
    syncFullscreenFromDocument,
    toggleFullscreen,
  }
}
