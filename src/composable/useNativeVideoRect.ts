import {onBeforeUnmount, watch, type Ref} from 'vue'
import {setNativeVideoRect} from '@/services/nativePlayer'
import {nativeVideoHolePath} from '@/utils/nativeVideoHole'

const HIDDEN = {x: 0, y: 0, w: 0, h: 0, cx: 0, cy: 0, cw: 0, ch: 0}
const HOLE_VAR = '--mpv-hole'

/**
 * Keeps the native mpv view glued to a DOM block. The view lives below the web layer, so the
 * block only reserves the space; it is polled every frame because layout changes (resize, panels
 * opening, fullscreen) have no single event, and only sends when the rectangle changes.
 *
 * With `punchHole`, the same rectangle is published as the `--mpv-hole` CSS variable, which the
 * stylesheet uses to cut the app UI and the dialog scrim out above the video (main-window player).
 */
export function useNativeVideoRect(
  hostEl: Ref<HTMLElement | null>,
  active: Ref<boolean>,
  punchHole?: Ref<boolean>,
) {
  const setHole = (rect: {x: number; y: number; w: number; h: number; r?: number} | null) => {
    const root = document.documentElement
    if (rect && punchHole?.value) {
      root.style.setProperty(HOLE_VAR, nativeVideoHolePath({width: window.innerWidth, height: window.innerHeight}, rect))
    } else {
      root.style.removeProperty(HOLE_VAR)
    }
  }

  let frame = 0
  let last = ''

  const tick = () => {
    const el = hostEl.value
    if (el) {
      const r = el.getBoundingClientRect()
      const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0
      const key = [r.left, r.top, r.width, r.height, window.innerWidth, window.innerHeight, radius].map(Math.round).join(',')
      if (key !== last) {
        last = key
        setNativeVideoRect({x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left, cy: r.top, cw: r.width, ch: r.height, r: radius})
        setHole({x: r.left, y: r.top, w: r.width, h: r.height, r: radius})
      }
    }
    frame = requestAnimationFrame(tick)
  }

  const stop = () => {
    cancelAnimationFrame(frame)
    frame = 0
    last = ''
    setHole(null)
  }

  watch(active, (on) => {
    stop()
    if (on) tick()
    else setNativeVideoRect(HIDDEN)
  }, {immediate: true})

  onBeforeUnmount(() => {
    stop()
    setNativeVideoRect(HIDDEN)
  })
}
