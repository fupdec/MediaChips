import {describe, expect, it, vi, beforeEach, afterEach} from 'vitest'
import {effectScope, nextTick, ref} from 'vue'
import {BIG_PREVIEW_CHROME_IDLE_MS, useBigPreviewChromeIdle} from './useBigPreviewChrome'

function withChromeIdle(ready: ReturnType<typeof ref<boolean>>) {
  const scope = effectScope()
  return scope.run(() => useBigPreviewChromeIdle(ready))!
}

describe('useBigPreviewChromeIdle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('hides chrome after idle and reveals on bump', async () => {
    const ready = ref(true)
    const {chromeHidden, revealChrome} = withChromeIdle(ready)

    expect(chromeHidden.value).toBe(false)
    vi.advanceTimersByTime(BIG_PREVIEW_CHROME_IDLE_MS)
    expect(chromeHidden.value).toBe(true)

    revealChrome()
    expect(chromeHidden.value).toBe(false)
    vi.advanceTimersByTime(BIG_PREVIEW_CHROME_IDLE_MS - 1)
    expect(chromeHidden.value).toBe(false)
    vi.advanceTimersByTime(1)
    expect(chromeHidden.value).toBe(true)
  })

  it('keeps chrome visible while held', async () => {
    const ready = ref(true)
    const {chromeHidden, holdChrome, releaseChrome} = withChromeIdle(ready)

    holdChrome()
    vi.advanceTimersByTime(BIG_PREVIEW_CHROME_IDLE_MS * 2)
    expect(chromeHidden.value).toBe(false)

    releaseChrome()
    vi.advanceTimersByTime(BIG_PREVIEW_CHROME_IDLE_MS)
    expect(chromeHidden.value).toBe(true)
  })

  it('resets when cinema chrome is not ready', async () => {
    const ready = ref(false)
    const {chromeHidden, revealChrome} = withChromeIdle(ready)

    revealChrome()
    vi.advanceTimersByTime(BIG_PREVIEW_CHROME_IDLE_MS)
    expect(chromeHidden.value).toBe(false)

    ready.value = true
    await nextTick()
    vi.advanceTimersByTime(BIG_PREVIEW_CHROME_IDLE_MS)
    expect(chromeHidden.value).toBe(true)

    ready.value = false
    await nextTick()
    expect(chromeHidden.value).toBe(false)
  })
})
