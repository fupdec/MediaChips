/**
 * Leading+trailing throttle: invokes immediately, then at most once per `wait`
 * ms with the latest args (flushes on the trailing edge).
 */
export function throttle<T extends (...args: never[]) => void>(
  fn: T,
  wait: number,
): T & {cancel: () => void; flush: () => void} {
  let lastInvoke = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastArgs: Parameters<T> | undefined

  const invoke = (args: Parameters<T>) => {
    lastInvoke = Date.now()
    lastArgs = undefined
    fn(...args)
  }

  const throttled = ((...args: Parameters<T>) => {
    lastArgs = args
    const elapsed = Date.now() - lastInvoke
    if (elapsed >= wait) {
      if (timer) {
        clearTimeout(timer)
        timer = undefined
      }
      invoke(args)
      return
    }
    if (timer) return
    timer = setTimeout(() => {
      timer = undefined
      if (lastArgs) invoke(lastArgs)
    }, wait - elapsed)
  }) as T & {cancel: () => void; flush: () => void}

  throttled.cancel = () => {
    if (timer) clearTimeout(timer)
    timer = undefined
    lastArgs = undefined
  }

  throttled.flush = () => {
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
    if (lastArgs) invoke(lastArgs)
  }

  return throttled
}
