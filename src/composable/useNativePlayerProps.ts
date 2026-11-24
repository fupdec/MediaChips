import {computed, watch, type Ref} from 'vue'
import type {usePlayerStore} from '@/stores/player'
import {buildNativeViewProps, diffProps, type MpvProps} from '@/utils/mpvPlayerProps'
import {setNativeProperty} from '@/services/nativePlayer'

/**
 * While native mpv plays, mirrors the player's view settings (aspect, rotation, flips, zoom, pan,
 * colour filters, equalizer) into mpv properties. Only changed properties are sent, and a fresh
 * mpv instance gets the full set when it becomes active.
 */
export function useNativePlayerProps(
  playerStore: ReturnType<typeof usePlayerStore>,
  surface: Ref<{width: number; height: number}>,
) {
  let applied: MpvProps | null = null

  const wanted = computed<MpvProps | null>(() => {
    if (!playerStore.nativeEngine) return null
    return buildNativeViewProps({
      aspectMode: playerStore.aspectMode,
      rotation: playerStore.rotation,
      flipH: playerStore.flipH,
      flipV: playerStore.flipV,
      zoom: playerStore.zoom,
      panX: playerStore.panX,
      panY: playerStore.panY,
      surface: surface.value,
      filters: playerStore.videoFilters,
      equalizerGains: playerStore.equalizerGains,
    })
  })

  watch(wanted, (next) => {
    if (!next) {
      applied = null
      return
    }
    const changed = diffProps(applied, next)
    applied = next
    for (const [name, value] of Object.entries(changed)) setNativeProperty(name, value)
  }, {immediate: true})
}
