import {onBeforeUnmount, ref, toValue, watch, type MaybeRefOrGetter} from 'vue'

export const BIG_PREVIEW_CHROME_IDLE_MS = 2400

export function useBigPreviewChromeIdle(isReady: MaybeRefOrGetter<boolean>) {
  const chromeHidden = ref(false)
  const chromeHeld = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  const clearTimer = () => {
    if (timer === undefined) return
    clearTimeout(timer)
    timer = undefined
  }

  const armTimer = () => {
    clearTimer()
    if (!toValue(isReady) || chromeHeld.value) return
    timer = setTimeout(() => {
      chromeHidden.value = true
    }, BIG_PREVIEW_CHROME_IDLE_MS)
  }

  const revealChrome = () => {
    if (!toValue(isReady)) return
    chromeHidden.value = false
    armTimer()
  }

  const holdChrome = () => {
    if (!toValue(isReady)) return
    chromeHeld.value = true
    chromeHidden.value = false
    clearTimer()
  }

  const releaseChrome = () => {
    chromeHeld.value = false
    revealChrome()
  }

  watch(() => toValue(isReady), (ready) => {
    chromeHeld.value = false
    clearTimer()
    chromeHidden.value = false
    if (ready) armTimer()
  }, {immediate: true})

  onBeforeUnmount(clearTimer)

  return {
    chromeHidden,
    revealChrome,
    holdChrome,
    releaseChrome,
  }
}
