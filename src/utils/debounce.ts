export interface DebounceOptions {
  leading?: boolean
  trailing?: boolean
}

export interface DebouncedFunction<T extends (...args: any[]) => void> {
  (...args: Parameters<T>): void
  cancel: () => void
}

export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  wait: number,
  options: DebounceOptions = {},
): DebouncedFunction<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  let lastArgs: Parameters<T> | undefined
  const leading = options.leading === true
  const trailing = options.trailing !== false

  const invoke = () => {
    if (lastArgs === undefined) return
    const args = lastArgs
    lastArgs = undefined
    fn(...args)
  }

  const debounced = (...args: Parameters<T>) => {
    lastArgs = args
    const shouldCallNow = leading && timeoutId === undefined

    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }

    timeoutId = setTimeout(() => {
      timeoutId = undefined
      if (trailing) {
        invoke()
      } else {
        lastArgs = undefined
      }
    }, wait)

    if (shouldCallNow) {
      lastArgs = undefined
      fn(...args)
    }
  }

  debounced.cancel = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
      timeoutId = undefined
    }
    lastArgs = undefined
  }

  return debounced as DebouncedFunction<T>
}
