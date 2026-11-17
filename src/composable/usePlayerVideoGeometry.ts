import {computed, onBeforeUnmount, ref, watch, type Ref} from 'vue'
import type {usePlayerStore} from '@/stores/player'
import {playerVideoStyle} from '@/utils/playerVideoGeometry'
import {createDefaultPlayerFilters, gammaExponent, playerFilterCss, sharpenKernel} from '@/utils/playerVideoFilters'
import {clampPan} from '@/utils/playerZoom'
import {DEFAULT_PLAYER_FILE_VIEW, loadPlayerFileView, savePlayerFileView} from '@/utils/playerFileView'

/**
 * Inline style for the player <video> element: aspect ratio override, rotation, flips, zoom and colour filters.
 * Fixed ratios and quarter turns need the wrapper size, so it is tracked with a ResizeObserver.
 * Aspect and orientation are remembered per library file (localStorage) and restored when it starts;
 * zoom resets when another media starts; colour filters last for the playback session and reset
 * when the player closes.
 */
export function usePlayerVideoGeometry(
  playerStore: ReturnType<typeof usePlayerStore>,
  surfaceEl: Ref<HTMLElement | null>,
) {
  const size = ref({width: 0, height: 0})
  let observer: ResizeObserver | null = null

  watch(surfaceEl, el => {
    observer?.disconnect()
    observer = null
    if (!el) return
    const update = () => { size.value = {width: el.clientWidth, height: el.clientHeight} }
    update()
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(update)
      observer.observe(el)
    }
  }, {immediate: true})

  const getStorage = (): Pick<Storage, 'getItem' | 'setItem'> | null => {
    try { return window.localStorage } catch { return null }
  }
  watch(() => playerStore.media?.id, id => {
    const storage = getStorage()
    const view = (id && id > 0 && storage ? loadPlayerFileView(storage, id) : null) ?? DEFAULT_PLAYER_FILE_VIEW
    playerStore.aspectMode = view.aspectMode
    playerStore.rotation = view.rotation
    playerStore.flipH = view.flipH
    playerStore.flipV = view.flipV
    playerStore.zoom = 1
    playerStore.panX = 0
    playerStore.panY = 0
  }, {immediate: true})
  watch(() => playerStore.zoom, zoom => {
    if (zoom <= 1) {
      playerStore.panX = 0
      playerStore.panY = 0
    }
  })
  watch(
    () => [playerStore.aspectMode, playerStore.rotation, playerStore.flipH, playerStore.flipV] as const,
    ([aspectMode, rotation, flipH, flipV]) => {
      const id = playerStore.media?.id
      const storage = getStorage()
      if (!id || id <= 0 || !storage) return
      savePlayerFileView(storage, id, {aspectMode, rotation, flipH, flipV})
    },
  )
  const resetFilters = () => { playerStore.videoFilters = createDefaultPlayerFilters() }
  watch(() => playerStore.active, active => { if (!active) resetFilters() })
  onBeforeUnmount(() => {
    observer?.disconnect()
    resetFilters()
  })

  const videoStyle = computed(() => {
    if (playerStore.isAudioMode) return {}
    const pan = clampPan({x: playerStore.panX, y: playerStore.panY}, playerStore.zoom, size.value)
    const style: Record<string, string> = playerVideoStyle({
      aspectMode: playerStore.aspectMode,
      rotation: playerStore.rotation,
      flipH: playerStore.flipH,
      flipV: playerStore.flipV,
      zoom: playerStore.zoom,
      panX: pan.x,
      panY: pan.y,
    }, size.value.width, size.value.height)
    const filter = playerFilterCss(playerStore.videoFilters)
    if (filter) style.filter = filter
    return style
  })
  const gammaFilterExponent = computed(() => gammaExponent(playerStore.videoFilters.gamma))

  const sharpenKernelMatrix = computed(() => sharpenKernel(playerStore.videoFilters.sharpen))

  return {videoStyle, gammaFilterExponent, sharpenKernelMatrix, size}
}
