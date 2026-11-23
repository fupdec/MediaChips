import {onBeforeUnmount, onMounted, watch, type Ref} from 'vue'
import {getMainScrollEl} from '@/utils/mainScroll'
import {getLayoutTopInScroll} from '@/utils/gridLayout'
import {
  INFINITE_JUMP_DEBOUNCE_MS,
  shouldJumpInfiniteWindow,
} from '@/composable/useItemsPage'

/** Retry delay while another list request is still running. */
const SEEK_BUSY_RETRY_MS = 150
const SEEK_BUSY_MAX_RETRIES = 40

interface SeekWindow {
  /** Absolute index of the first loaded card. */
  start: number
  loaded: number
  /** Whole filtered list length. */
  total: number
}

type GridHost = HTMLElement | {$el?: unknown} | null

interface Options {
  gridRef: Ref<GridHost>
  enabled: () => boolean
  getWindow: () => SeekWindow
  isBusy: () => boolean
  /** Replace the loaded window so it contains `seekIndex`. */
  jump: (seekIndex: number) => Promise<boolean>
}

/**
 * Scrollbar seeks for the virtual grid. Row height is fixed, so the card index
 * under the viewport is `row * columns` — no measuring. When the viewport leaves
 * the loaded window (above it, or far below it) the window is replaced around
 * the viewport; just below the window the end sentinel appends as before.
 */
export function useInfiniteWindowSeek(options: Options) {
  let scrollEl: HTMLElement | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let running = false
  let busyRetries = 0
  let bindingGeneration = 0

  const resolveGridEl = (): HTMLElement | null => {
    const host = options.gridRef.value as {$el?: unknown} | HTMLElement | null
    const el = host && '$el' in host ? host.$el : host
    return el instanceof HTMLElement ? el : null
  }

  const clearTimer = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }

  const schedule = (delay = INFINITE_JUMP_DEBOUNCE_MS) => {
    if (!scrollEl || !options.enabled()) return
    clearTimer()
    timer = setTimeout(() => {
      timer = null
      void evaluate()
    }, delay)
  }

  const evaluate = async (): Promise<void> => {
    if (!options.enabled() || !scrollEl || running) return
    const gridEl = resolveGridEl()
    if (!gridEl) return

    const stride = Number(gridEl.dataset.rowHeight) || 0
    const columns = Math.floor(Number(gridEl.dataset.columnCount) || 0)
    const {start, loaded, total} = options.getWindow()
    if (stride <= 0 || columns <= 0 || loaded <= 0 || total <= 0) return
    // Whole list is already loaded — nothing to seek.
    if (start <= 0 && loaded >= total) return

    const layoutTop = getLayoutTopInScroll(gridEl, scrollEl)
    const top = Math.max(0, scrollEl.scrollTop - layoutTop)
    const bottom = Math.max(top, scrollEl.scrollTop + scrollEl.clientHeight - layoutTop)
    const indexAt = (y: number) => Math.min(
      total - 1,
      Math.max(0, Math.floor(y / stride) * columns),
    )
    const topIndex = indexAt(top)
    const bottomIndex = indexAt(Math.max(top, bottom - 1))
    const seekIndex = indexAt((top + bottom) / 2)

    const needsJump = topIndex < start
      || shouldJumpInfiniteWindow(bottomIndex, start, loaded)
    if (!needsJump) {
      busyRetries = 0
      return
    }

    if (options.isBusy()) {
      // An append or refresh is running — look again once it finishes.
      if (busyRetries < SEEK_BUSY_MAX_RETRIES) {
        busyRetries += 1
        schedule(SEEK_BUSY_RETRY_MS)
      }
      return
    }
    busyRetries = 0

    const expectedGeneration = bindingGeneration
    running = true
    let jumped = false
    try {
      jumped = await options.jump(seekIndex)
    } catch (error) {
      if (expectedGeneration === bindingGeneration) console.warn('Failed to seek the media grid', error)
    } finally {
      running = false
    }
    // The user may have kept scrolling while the window loaded.
    if (jumped && expectedGeneration === bindingGeneration) schedule(0)
  }

  const onScroll = () => {
    if (!options.enabled()) return
    busyRetries = 0
    schedule()
  }

  const bind = () => {
    unbind()
    if (!options.enabled()) return
    scrollEl = getMainScrollEl() as HTMLElement | null
    scrollEl?.addEventListener('scroll', onScroll, {passive: true})
  }

  const unbind = () => {
    bindingGeneration += 1
    busyRetries = 0
    scrollEl?.removeEventListener('scroll', onScroll)
    scrollEl = null
    clearTimer()
  }

  onMounted(bind)
  onBeforeUnmount(unbind)
  watch(() => options.enabled(), (active) => {
    if (active) bind()
    else unbind()
  })

  return {evaluate: () => { busyRetries = 0; schedule(0) }}
}
