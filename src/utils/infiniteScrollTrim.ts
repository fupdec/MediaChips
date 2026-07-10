import { nextTick } from 'vue'
import { getMainScrollEl } from '@/utils/mainScroll'

/** Keep scroll position stable after dropping rows from the top of an infinite list. */
export function compensateScrollAfterTopTrim(previousScrollHeight: number): void {
  const scrollEl = getMainScrollEl() as HTMLElement | null
  if (!scrollEl || previousScrollHeight <= 0) return

  void nextTick(() => {
    requestAnimationFrame(() => {
      const heightRemoved = previousScrollHeight - scrollEl.scrollHeight
      if (heightRemoved > 0) {
        scrollEl.scrollTop = Math.max(0, scrollEl.scrollTop - heightRemoved)
      }
    })
  })
}
